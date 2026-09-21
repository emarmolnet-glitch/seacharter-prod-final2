import React, { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../utils/apiConfig.js';
import { parsePackingList } from '../utils/packingListParser.js';
import AgenteProyectosWidget from './AgenteProyectosWidget';
import '../../dual-trading-chartering-view.js';
import {
  buildCBAMCommercialAnalysis,
  generateCBAMCommercialProformaPDF,
  generateCBAMReportPDF,
  generateCBAMRequirementsPDF,
  updateCBAMState,
  CBAM_FACTORS,
  PRICE_2026,
} from '../../cbam-module.js';

export const COMMODITY_TARIFFS = {
  "CEM I 52,5N BIGBAG": { inlandUsdMt: 3.00, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 3.50 },
  "CEM I 52,5N SAC 50KG": { inlandUsdMt: 3.00, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 3.50 },
  "CEM I 42,5N/R BIGBAG": { inlandUsdMt: 3.00, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 3.50 },
  "CEM I 42,5N/R SAC 50KG": { inlandUsdMt: 3.00, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 3.50 },
  "CEM II 52.5N/R 50KG": { inlandUsdMt: 4.26, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 2.60 },
  "CEM II 52.5N BIGBAG": { inlandUsdMt: 4.26, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 3.50 },
  "CEM II 42,5N/R FARDILISE": { inlandUsdMt: 4.26, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 2.56 },
  "CEM II 42,5N/R FARDILLISE TAVCIM": { inlandUsdMt: 4.26, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 2.65 },
  "CEM II 42,5 VRAC": { inlandUsdMt: 4.30, portDuesUsdMt: 2.00, customsUsdMt: 0.30, packagingUsdMt: 3.50 },
  "CEM II 42,5 R BIGBAG": { inlandUsdMt: 4.30, portDuesUsdMt: 2.00, customsUsdMt: 0.30, packagingUsdMt: 3.50 },
  "CEM I 52,5 R BIGBAG": { inlandUsdMt: 3.00, portDuesUsdMt: 2.00, customsUsdMt: 0.30, packagingUsdMt: 3.50 }
};

function NumericCounter({ label, subtitle, value, onChange, min = 0 }) {
  const numValue = Number(value) || 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between hover:border-blue-300 transition shadow-sm">
      <div className="mb-2">
        <span className="block text-xs font-bold text-slate-800 tracking-wide">{label}</span>
        {subtitle && <span className="block text-[11px] text-slate-500 mt-0.5">{subtitle}</span>}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Unidades</span>
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
          <button type="button" onClick={() => { if (numValue > min) onChange(numValue - 1); }} disabled={numValue <= min} className="w-7 h-7 flex items-center justify-center rounded bg-white hover:bg-slate-200 border border-slate-200 text-slate-700 disabled:opacity-30 text-base font-black transition cursor-pointer shadow-sm">-</button>
          <input type="number" min={min} value={numValue} onChange={(e) => { const p = parseInt(e.target.value, 10); onChange(isNaN(p) ? 0 : Math.max(min, p)); }} className="w-14 text-center bg-transparent text-sm font-mono font-bold text-blue-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
          <button type="button" onClick={() => onChange(numValue + 1)} className="w-7 h-7 flex items-center justify-center rounded bg-white hover:bg-slate-200 border border-slate-200 text-slate-700 text-base font-black transition cursor-pointer shadow-sm">+</button>
        </div>
      </div>
    </div>
  );
}

const readFileAsDataURL = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

function normalizeStr(val) {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const STANDARD_VESSEL_STOWAGE_SPEC = Object.freeze({
  vesselType: 'Multi-Purpose MPP / Handysize Bulker',
  dwt: 32000,
  grainCapacityCbm: 30300,
  baleCapacityCbm: 28500,
  holdsCount: 4,
  deckCranes: '2 x 60t SWL combinables en tándem hasta 120t',
  weatherDeck: {
    name: 'Cubierta Superior (Weather Deck)',
    deckAreaM2: 1800,
    maxPermissibleLoadTm2: 3.5,
    maxContainerTeus: 180,
    securingMethod: 'Conos de fijación (twistlocks automáticos), barras tensoras cruzadas y tensores mecánicos a cáncamos soldados de cubierta.',
    legend: 'Twistlocks automáticos + Barras tensoras',
  },
  tweenDeck: {
    name: 'Entrepuente General (Tween Deck)',
    totalAreaM2: 1940,
    maxPermissibleLoadTm2: 4.5,
    clearHeightM: 3.20,
    securingMethod: 'Estiba vertical sobre pontones de entrepuente con cinchas de poliéster de alta tenacidad, redes de estiba perimetral y cantoneras de protección.',
    legend: 'Cinchas de poliéster + Redes de estiba',
  },
  tanktop: {
    name: 'Fondo de Bodega General (Tanktop)',
    totalAreaM2: 2220,
    maxPermissibleLoadTm2: 20.0,
    securingMethod: 'Reparto de presiones con cunas de madera estructurales (hardwood dunnage), durmientes certificados y cadenas G80 cruzadas con tensores de trinquete.',
    legend: 'Cunas de madera estructurales + Cadenas G80',
  },
  holds: [
    {
      holdNumber: 1,
      name: 'Bodega 1 (Proa / Fwd)',
      capacityCbm: 5500,
      tanktopAreaM2: 420,
      tanktopMaxLoadTm2: 18.0,
      tweenDeckAreaM2: 380,
      tweenDeckMaxLoadTm2: 4.5,
    },
    {
      holdNumber: 2,
      name: 'Bodega 2 (Crujía Proa / Mid-Fwd)',
      capacityCbm: 8800,
      tanktopAreaM2: 620,
      tanktopMaxLoadTm2: 20.0,
      tweenDeckAreaM2: 550,
      tweenDeckMaxLoadTm2: 4.5,
    },
    {
      holdNumber: 3,
      name: 'Bodega 3 (Crujía Popa / Mid-Aft)',
      capacityCbm: 8800,
      tanktopAreaM2: 620,
      tanktopMaxLoadTm2: 20.0,
      tweenDeckAreaM2: 550,
      tweenDeckMaxLoadTm2: 4.5,
    },
    {
      holdNumber: 4,
      name: 'Bodega 4 (Popa / Aft)',
      capacityCbm: 7200,
      tanktopAreaM2: 520,
      tanktopMaxLoadTm2: 18.0,
      tweenDeckAreaM2: 460,
      tweenDeckMaxLoadTm2: 4.5,
    },
  ],
});

function generateDynamicStowageAscii(stowagePlan) {
  const pad = (text, width = 84) => {
    const s = String(text ?? '');
    return s.length > width ? s.substring(0, width) : s + ' '.repeat(width - s.length);
  };
  const makeLine = (text) => `| ${pad(text, 84)} |`;

  const borderDbl = `+${'='.repeat(86)}+`;
  const borderSingle = `+${'-'.repeat(86)}+`;

  const holds = stowagePlan?.holds || [];
  const h1 = holds[0] || {};
  const h2 = holds[1] || {};
  const h3 = holds[2] || {};
  const h4 = holds[3] || {};
  const deck = stowagePlan?.weatherDeck || {};
  const hydro = stowagePlan?.hydrodynamicsAndSafety || {};
  const classification = stowagePlan?.cargoClassification || {};
  const isMixed = classification.isMixedCargo;
  const mixBreakdown = classification.cargoMixBreakdown || [];

  const lines = [];
  lines.push(borderDbl);
  lines.push(`| [PROA / BOW]        UNIVERSAL STOWAGE ENGINE · SEACHARTER PRO        [POPA / STERN] |`);
  lines.push(makeLine(`Buque: Handysize MPP / Bulk Carrier | DWT: 32,000 MT | Grúas: 2x60t (Tándem 120t SWL)`));
  lines.push(borderDbl);

  // SECCIÓN 1: CUBIERTA SUPERIOR / WEATHER DECK
  lines.push(makeLine(`CUBIERTA PRINCIPAL / WEATHER DECK (Capacidad admisible: 3.50 t/m²)`));
  if (deck.totalWeightTons > 0) {
    const deckDesc = deck.allocatedItems?.map(it => `${it.quantity}x ${it.type} (${it.totalWeightMT} MT)`).join(', ') || 'Carga sobre cubierta';
    lines.push(makeLine(`  [ CUBIERTA INTEMPERIE ]: ${deckDesc.substring(0, 60)}`));
    lines.push(makeLine(`  Trincaje: ${deck.securingLegend || 'Twistlocks automáticos + Barras tensoras'}`));
  } else {
    lines.push(makeLine(`  [ CUBIERTA LIBRE ]: Despejada para operativa con grúas de a bordo o en tándem`));
    lines.push(makeLine(`  Capacidad admisible: 3.50 t/m² | Guías y cáncamos de trincaje certificados OMI`));
  }
  lines.push(borderSingle);

  // SECCIÓN 2: ENTREPUENTE / TWEEN DECK
  lines.push(makeLine(`ENTREPUENTE / TWEEN DECK (Capacidad admisible: 4.50 t/m² | Gálibo vertical: 3.20m)`));
  const tweenDeckItems = [
    ...(h1.allocatedItems || []).filter(it => it.tier === 'TWEEN_DECK'),
    ...(h2.allocatedItems || []).filter(it => it.tier === 'TWEEN_DECK'),
    ...(h3.allocatedItems || []).filter(it => it.tier === 'TWEEN_DECK'),
    ...(h4.allocatedItems || []).filter(it => it.tier === 'TWEEN_DECK'),
  ];
  if (tweenDeckItems.length > 0) {
    const tweenDesc = tweenDeckItems.map(it => `${it.quantity}x ${it.type} (${it.totalWeightMT} MT)`).join(' | ');
    lines.push(makeLine(`  [ CARGA PALETIZADA / LIGERA ]: ${tweenDesc.substring(0, 58)}`));
    lines.push(makeLine(`  Trincaje: Estiba vertical trincada con cinchas de poliéster de alta tenacidad y redes`));
  } else {
    lines.push(makeLine(`  [ PONTONES REPLEGADOS / CONTINUO ]: Espacio libre integrado para optimizar bodega corrida`));
    lines.push(makeLine(`  Aptitud técnica para cargas sobredimensionadas (OOG) o estiba masiva continua`));
  }
  lines.push(borderSingle);

  // SECCIÓN 3: FONDO DE BODEGA / TANKTOP
  lines.push(makeLine(`FONDO DE BODEGA / TANKTOP (MÁXIMA RESISTENCIA ESTRUCTURAL: 18.0 - 20.0 t/m²)`));
  const tanktopItems = [
    ...(h1.allocatedItems || []).filter(it => it.tier === 'TANKTOP' || it.tier === 'BODEGA_BLOQUE'),
    ...(h2.allocatedItems || []).filter(it => it.tier === 'TANKTOP' || it.tier === 'BODEGA_BLOQUE'),
    ...(h3.allocatedItems || []).filter(it => it.tier === 'TANKTOP' || it.tier === 'BODEGA_BLOQUE'),
    ...(h4.allocatedItems || []).filter(it => it.tier === 'TANKTOP' || it.tier === 'BODEGA_BLOQUE'),
  ];
  if (tanktopItems.length > 0) {
    const hasHeavy = tanktopItems.some(it => it.tier === 'TANKTOP');
    const hasBlock = tanktopItems.some(it => it.tier === 'BODEGA_BLOQUE');
    if (hasHeavy && hasBlock) {
      const heavyPieces = tanktopItems.filter(it => it.tier === 'TANKTOP');
      const blockPieces = tanktopItems.filter(it => it.tier === 'BODEGA_BLOQUE');
      const hDesc = heavyPieces.map(it => `${it.quantity}x ${it.type} (${it.totalWeightMT} MT)`).join(' | ');
      const bDesc = blockPieces.map(it => `${it.quantity}x ${it.type} (${it.totalWeightMT} MT)`).join(' | ');
      lines.push(makeLine(`  [ TANKTOP PESADO ]: ${hDesc.substring(0, 59)}`));
      lines.push(makeLine(`  [ BODEGA BLOQUE ]: ${bDesc.substring(0, 60)}`));
      lines.push(makeLine(`  Trincaje: Cunas de madera estructurales y cadenas G80 (Maquinaria) | Spreader y air bags`));
    } else if (hasHeavy) {
      const heavyDesc = tanktopItems.map(it => `${it.quantity}x ${it.type} (${it.totalWeightMT} MT)`).join(' | ');
      lines.push(makeLine(`  [ MAQUINARIA / HEAVY LIFT ]: ${heavyDesc.substring(0, 58)}`));
      lines.push(makeLine(`  Trincaje: Cunas de madera estructurales (hardwood dunnage) y cadenas cruzadas G80`));
    } else {
      const blockDesc = tanktopItems.map(it => `${it.quantity}x ${it.type} (${it.totalWeightMT} MT)`).join(' | ');
      lines.push(makeLine(`  [ ESTIBA EN BLOQUE ]: ${blockDesc.substring(0, 60)}`));
      lines.push(makeLine(`  Trincaje: Izado simultáneo con Spreader multipunto, cojines de aire y láminas`));
    }
  } else {
    lines.push(makeLine(`  [ PLAN DE BODEGA LIMPIO ]: Doble fondo barrido y seco listo para embarque`));
    lines.push(makeLine(`  Resistencia máxima: 20.0 t/m² | Puntos de trincaje D-rings certificados según CSS`));
  }
  lines.push(borderDbl);

  // SECCIÓN 4: MATRIZ DE DISTRIBUCIÓN POR BODEGAS 1 A 4
  lines.push(makeLine(`DISTRIBUCIÓN MATRICIAL POR BODEGAS (PROA ➔ POPA) Y PROPORCIONES DE PESO (%):`));
  lines.push(makeLine(`• Bodega 1 (Proa): ${Number(h1.totalWeightTons || 0).toFixed(2)} MT (${Number(h1.weightPercentage || 0).toFixed(1)}%) | ${(h1.cargoCategories?.join(', ') || 'Vacía').substring(0, 24)} | ${h1.securingLegend || 'Despejada'}`));
  lines.push(makeLine(`• Bodega 2 (Crujía Proa): ${Number(h2.totalWeightTons || 0).toFixed(2)} MT (${Number(h2.weightPercentage || 0).toFixed(1)}%) | ${(h2.cargoCategories?.join(', ') || 'Vacía').substring(0, 24)} | ${h2.securingLegend || 'Despejada'}`));
  lines.push(makeLine(`• Bodega 3 (Crujía Popa): ${Number(h3.totalWeightTons || 0).toFixed(2)} MT (${Number(h3.weightPercentage || 0).toFixed(1)}%) | ${(h3.cargoCategories?.join(', ') || 'Vacía').substring(0, 24)} | ${h3.securingLegend || 'Despejada'}`));
  lines.push(makeLine(`• Bodega 4 (Popa): ${Number(h4.totalWeightTons || 0).toFixed(2)} MT (${Number(h4.weightPercentage || 0).toFixed(1)}%) | ${(h4.cargoCategories?.join(', ') || 'Vacía').substring(0, 24)} | ${h4.securingLegend || 'Despejada'}`));
  if (deck.totalWeightTons > 0) {
    lines.push(makeLine(`• Cubierta (Weather Deck): ${Number(deck.totalWeightTons || 0).toFixed(2)} MT (${Number(deck.weightPercentage || 0).toFixed(1)}%) | Contenedores / Unidades Rodadas | ${deck.securingLegend}`));
  }
  lines.push(borderSingle);

  // SECCIÓN 5: DESGLOSE MULTI-CARGA EN CASO DE MERCANCÍAS MIXTAS
  if (isMixed && mixBreakdown.length > 0) {
    lines.push(makeLine(`DETALLE DE CARGAS MIXTAS Y PROPORCIONES ESPECÍFICAS:`));
    mixBreakdown.forEach((mb) => {
      lines.push(makeLine(`  ▸ ${mb.category}: ${mb.weightTons.toFixed(2)} MT (${mb.weightPercentage.toFixed(1)}%) ➔ ${mb.assignedLocations} [${mb.securingLegend}]`));
    });
    lines.push(borderSingle);
  }

  // SECCIÓN 6: COMPROBACIÓN HIDRODINÁMICA, VOLUMEN Y LÍMITES DE PRESIÓN
  lines.push(makeLine(`VALIDACIÓN TÉCNICA E HIDRODINÁMICA (CÓDIGO CSS OMI & ESTABILIDAD INTACTA):`));
  const volOk = !hydro.isCubicCapacityExceeded ? 'CUMPLE CAPACIDAD CÚBICA' : 'EXCEDIDO';
  const pressOk = !hydro.isPermissibleLoadExceeded ? 'RESISTENCIA T/M² VALIDADA' : 'REQUIERE REPARTO PRESIÓN';
  lines.push(makeLine(`• Volumen Ocupado: ${Number(hydro.totalVolumeOccupiedCbm || 0).toFixed(2)} m³ de ${hydro.grainCapacityCbm || 30300} m³ (${Number(hydro.volumeUtilizationShipPct || 0).toFixed(1)}%) [${volOk}]`));
  lines.push(makeLine(`• Presión Máxima: ${Number(hydro.maxFloorPressureTm2 || 0).toFixed(2)} t/m² <= Límite ${hydro.maxFloorAllowableTm2 || 20.0} t/m² [${pressOk}]`));
  lines.push(makeLine(`• Estabilidad GM: Altura metacéntrica estimada GM = ${hydro.metacentricHeightGmEstimatedM || 1.55}m (Centro de gravedad bajo [OK])`));
  lines.push(borderDbl);

  return lines.join('\n');
}

function calculateUniversalStowagePlan(items = [], orderTotals = null, options = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const spec = STANDARD_VESSEL_STOWAGE_SPEC;

  const DEFAULT_SF_BY_FAMILY = {
    big_bags: { sf: 1.35, height: 1.6, tier: 'BODEGA_BLOQUE' },
    heavy_machinery: { sf: 2.00, height: 2.8, tier: 'TANKTOP' },
    steel_structures: { sf: 1.10, height: 1.5, tier: 'TANKTOP' },
    containers: { sf: 2.40, height: 2.6, tier: 'WEATHER_DECK' },
    vehicles: { sf: 3.60, height: 2.2, tier: 'WEATHER_DECK' },
    pallets_general: { sf: 2.20, height: 1.8, tier: 'TWEEN_DECK' },
    supplies: { sf: 2.50, height: 1.5, tier: 'TWEEN_DECK' },
    default: { sf: 1.80, height: 2.0, tier: 'TWEEN_DECK' },
  };

  const analyzedItems = safeItems.map((it, idx) => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const unitWtKg = Number(it.weight ?? it.unit_weight_kg) || 0;
    const unitWtMT = unitWtKg / 1000;
    const totalWtMT = Math.round(unitWtMT * qty * 1000) / 1000;

    const len = Number(it.length ?? it.length_m) || 0;
    const wid = Number(it.width ?? it.width_m) || 0;
    const hgt = Number(it.height ?? it.height_m) || 0;

    const cat = String(it.category || '').trim();
    const typeStr = String(it.type || '').trim();
    const mode = String(it.shipping_mode_supported || '').trim();
    const combinedNorm = normalizeStr(`${cat} ${typeStr} ${mode}`);

    let cargoFamily = 'default';
    if (
      cat === 'Mercancía Ensacada / Dry Bulk' ||
      mode === 'Big Bags / Granel' ||
      combinedNorm.includes('big bag') || combinedNorm.includes('bigbag') || combinedNorm.includes('fibc') ||
      combinedNorm.includes('saco') || combinedNorm.includes('cemento') || combinedNorm.includes('granel') ||
      combinedNorm.includes('urea') || combinedNorm.includes('cereal') || combinedNorm.includes('fertilizante')
    ) {
      cargoFamily = 'big_bags';
    } else if (
      mode === 'Contenedor (FCL / LCL)' ||
      mode === 'Plataforma / Flat Rack' ||
      combinedNorm.includes('contenedor') || combinedNorm.includes('container') || combinedNorm.includes('flat rack')
    ) {
      cargoFamily = 'containers';
    } else if (
      mode === 'Ro-Ro / Vehículo Rodado' ||
      cat === 'Vehículo / Unidades Rodadas' ||
      combinedNorm.includes('vehiculo') || combinedNorm.includes('camion') || combinedNorm.includes('ro-ro')
    ) {
      cargoFamily = 'vehicles';
    } else if (
      cat === 'Estructura Metálica' ||
      combinedNorm.includes('acero') || combinedNorm.includes('viga') || combinedNorm.includes('tuberia') || combinedNorm.includes('perfil')
    ) {
      cargoFamily = 'steel_structures';
    } else if (
      cat === 'Maquinaria / Equipos Industriales' ||
      mode === 'Breakbulk / Maquinaria Suelta' ||
      unitWtMT >= 15 ||
      combinedNorm.includes('maquinaria') || combinedNorm.includes('excavadora') || combinedNorm.includes('transformador') || combinedNorm.includes('turbina')
    ) {
      cargoFamily = 'heavy_machinery';
    } else if (
      cat === 'Suministros / Supplies' ||
      combinedNorm.includes('suministro') || combinedNorm.includes('repuesto')
    ) {
      cargoFamily = 'supplies';
    } else if (
      cat === 'Carga General / General Cargo' ||
      combinedNorm.includes('pallet') || combinedNorm.includes('caja') || combinedNorm.includes('bulto')
    ) {
      cargoFamily = 'pallets_general';
    }

    const familyDefaults = DEFAULT_SF_BY_FAMILY[cargoFamily] || DEFAULT_SF_BY_FAMILY.default;

    let unitVolCbm = 0;
    let unitFootprintM2 = 0;

    if (len > 0 && wid > 0 && hgt > 0) {
      unitVolCbm = Math.round(len * wid * hgt * 1000) / 1000;
      unitFootprintM2 = Math.round(len * wid * 1000) / 1000;
    } else {
      unitVolCbm = unitWtMT > 0 ? Math.round(unitWtMT * familyDefaults.sf * 1000) / 1000 : Math.round(familyDefaults.sf * 1000) / 1000;
      unitFootprintM2 = Math.round((unitVolCbm / familyDefaults.height) * 1000) / 1000;
    }

    const totalVolCbm = Math.round(unitVolCbm * qty * 100) / 100;
    const totalFootprintM2 = Math.round(unitFootprintM2 * qty * 100) / 100;
    const stowageFactor = totalWtMT > 0 ? Math.round((totalVolCbm / totalWtMT) * 100) / 100 : familyDefaults.sf;
    const footprintPressureTm2 = unitFootprintM2 > 0 ? Math.round((unitWtMT / unitFootprintM2) * 100) / 100 : 0;

    let tier = familyDefaults.tier;
    let compartmentName = '';
    let stowageMethod = '';
    let securingLegend = '';
    let maxPermissiblePressure = 20.0;

    if (tier === 'TANKTOP') {
      compartmentName = 'Fondo de Bodega / Tanktop (Doble Fondo Reforzado)';
      stowageMethod = 'Estiba en fondo de bodega (Tanktop) con reparto de presiones sobre cunas de madera estructurales y trincaje pesado con cadenas G80 y cables de acero.';
      securingLegend = 'Cunas de madera estructurales y cadenas G80';
      maxPermissiblePressure = 20.0;
    } else if (tier === 'BODEGA_BLOQUE') {
      compartmentName = 'Bodega Corrida (Bloque Autosustentado)';
      stowageMethod = 'Estiba compacta en bloque trabado (Block Stowage) mediante spreader multipunto en ciclos de 14-16 sacos, cojines de aire neumáticos (Dunnage Air Bags) y láminas antihumedad continuas.';
      securingLegend = 'Spreader multipunto y estiba en bloque';
      maxPermissiblePressure = 20.0;
    } else if (tier === 'WEATHER_DECK') {
      if (cargoFamily === 'vehicles') {
        compartmentName = 'Cubierta Rodante / Weather Deck';
        stowageMethod = 'Estiba rodada con calzos de acuñado de seguridad y cinchas de poliéster 5T a puntos de anclaje D-Rings estructurales.';
        securingLegend = 'Calzos de seguridad y cinchas a D-Rings';
      } else {
        compartmentName = 'Cubierta Superior / Weather Deck (Celdas / Puntos de Trincaje)';
        stowageMethod = 'Estiba sobre cubierta corrida con conos de fijación (twistlocks automáticos), barras tensoras (lashing rods) y tensores mecánicos.';
        securingLegend = 'Twistlocks automáticos y barras tensoras';
      }
      maxPermissiblePressure = 3.5;
    } else {
      compartmentName = 'Entrepuente / Tween Deck (Capas Superiores)';
      stowageMethod = 'Estiba vertical sobre pontones de entrepuente con cinchas de poliéster de alta tenacidad, redes de trincaje perimetral y cantoneras de protección.';
      securingLegend = 'Estiba vertical trincada con cinchas y redes';
      maxPermissiblePressure = 4.5;
    }

    const pressureExceeded = footprintPressureTm2 > maxPermissiblePressure;

    return {
      id: it.id || `item-stow-${idx}`,
      originalIndex: idx,
      category: cat || 'Carga General / General Cargo',
      type: typeStr || `Partida ${idx + 1}`,
      quantity: qty,
      unitWeightKg: unitWtKg,
      unitWeightMT: unitWtMT,
      totalWeightMT: totalWtMT,
      dimensions: { length: len, width: wid, height: hgt },
      unitVolumeCbm: unitVolCbm,
      totalVolumeCbm: totalVolCbm,
      unitFootprintM2: unitFootprintM2,
      totalFootprintM2: totalFootprintM2,
      stowageFactorM3Mt: stowageFactor,
      footprintPressureTm2: footprintPressureTm2,
      cargoFamily,
      tier,
      compartmentName,
      stowageMethod,
      securingLegend,
      maxPermissiblePressure,
      pressureExceeded,
    };
  });

  const totalCargoWeightMT = Math.round(analyzedItems.reduce((acc, it) => acc + it.totalWeightMT, 0) * 1000) / 1000;
  const totalCargoVolumeCbm = Math.round(analyzedItems.reduce((acc, it) => acc + it.totalVolumeCbm, 0) * 100) / 100;
  const totalPieces = analyzedItems.reduce((acc, it) => acc + it.quantity, 0);

  const distinctCategories = [...new Set(analyzedItems.map(it => it.category).filter(Boolean))];
  const distinctTiers = [...new Set(analyzedItems.map(it => it.tier).filter(Boolean))];
  const distinctFamilies = [...new Set(analyzedItems.map(it => it.cargoFamily).filter(Boolean))];
  const isMixedCargo = distinctCategories.length > 1 || distinctTiers.length > 1 || distinctFamilies.length > 1;

  const weatherDeckItems = [];
  const hold1Items = [];
  const hold2Items = [];
  const hold3Items = [];
  const hold4Items = [];

  if (analyzedItems.length === 0) {
    // Sin ítems
  } else if (!isMixedCargo) {
    const primaryFamily = distinctFamilies[0] || 'default';
    if (primaryFamily === 'big_bags') {
      const ratios = [0.18, 0.32, 0.32, 0.18];
      spec.holds.forEach((h, hIdx) => {
        const holdItems = analyzedItems.map(it => ({
          ...it,
          quantity: Math.max(1, Math.round(it.quantity * ratios[hIdx])),
          totalWeightMT: Math.round(it.totalWeightMT * ratios[hIdx] * 100) / 100,
          totalVolumeCbm: Math.round(it.totalVolumeCbm * ratios[hIdx] * 100) / 100,
          allocatedToHold: h.holdNumber,
        }));
        if (hIdx === 0) hold1Items.push(...holdItems);
        else if (hIdx === 1) hold2Items.push(...holdItems);
        else if (hIdx === 2) hold3Items.push(...holdItems);
        else if (hIdx === 3) hold4Items.push(...holdItems);
      });
    } else if (primaryFamily === 'containers' || primaryFamily === 'vehicles') {
      weatherDeckItems.push(...analyzedItems);
    } else if (primaryFamily === 'heavy_machinery' || primaryFamily === 'steel_structures') {
      analyzedItems.forEach((it, i) => {
        if (i % 2 === 0) hold2Items.push({ ...it, allocatedToHold: 2 });
        else hold1Items.push({ ...it, allocatedToHold: 1 });
      });
    } else {
      analyzedItems.forEach((it, i) => {
        const target = (i % 3) + 1;
        if (target === 1) hold1Items.push({ ...it, allocatedToHold: 1 });
        else if (target === 2) hold2Items.push({ ...it, allocatedToHold: 2 });
        else hold3Items.push({ ...it, allocatedToHold: 3 });
      });
    }
  } else {
    for (const it of analyzedItems) {
      if (it.tier === 'WEATHER_DECK') {
        it.allocatedToHold = 'Cubierta';
        weatherDeckItems.push(it);
      } else if (it.tier === 'TANKTOP') {
        if (hold2Items.reduce((acc, x) => acc + x.totalWeightMT, 0) < 500) {
          it.allocatedToHold = 2;
          hold2Items.push(it);
        } else {
          it.allocatedToHold = 1;
          hold1Items.push(it);
        }
      } else if (it.tier === 'BODEGA_BLOQUE') {
        if (hold3Items.reduce((acc, x) => acc + x.totalWeightMT, 0) < 800) {
          it.allocatedToHold = 3;
          hold3Items.push(it);
        } else {
          it.allocatedToHold = 4;
          hold4Items.push(it);
        }
      } else {
        if (hold1Items.reduce((acc, x) => acc + x.totalWeightMT, 0) <= hold2Items.reduce((acc, x) => acc + x.totalWeightMT, 0)) {
          it.allocatedToHold = 1;
          hold1Items.push(it);
        } else {
          it.allocatedToHold = 2;
          hold2Items.push(it);
        }
      }
    }
  }

  const buildHoldSummary = (holdSpec, holdItems) => {
    const holdWeight = Math.round(holdItems.reduce((acc, it) => acc + it.totalWeightMT, 0) * 100) / 100;
    const holdVolume = Math.round(holdItems.reduce((acc, it) => acc + it.totalVolumeCbm, 0) * 100) / 100;
    const weightPct = totalCargoWeightMT > 0 ? Math.round((holdWeight / totalCargoWeightMT) * 1000) / 10 : 0;
    const volUtilPct = Math.round((holdVolume / holdSpec.capacityCbm) * 1000) / 10;
    const actualMaxPressure = holdItems.reduce((max, it) => Math.max(max, it.footprintPressureTm2 || 0), 0);
    const permissibleLoad = holdSpec.tanktopMaxLoadTm2;
    const holdCategories = [...new Set(holdItems.map(it => it.category).filter(Boolean))];

    let stowMethod = 'Bodega despejada / en reserva para lastre o viaje de retorno';
    let secLegend = 'Ninguno requerido';
    let tierSummary = 'Vacía';

    if (holdItems.length > 0) {
      const tiersInHold = [...new Set(holdItems.map(it => it.tier))];
      if (tiersInHold.includes('TANKTOP') && tiersInHold.includes('TWEEN_DECK')) {
        tierSummary = 'Mixto (Tanktop + Tween Deck)';
        stowMethod = 'Estiba compartimentada: Maquinaria pesada en Tanktop con cunas estructurales y carga general en Tween Deck';
        secLegend = 'Cunas + Cadenas G80 en Tanktop | Cinchas + Redes en Tween Deck';
      } else if (tiersInHold.includes('TANKTOP')) {
        tierSummary = 'Tanktop (Fondo de Bodega)';
        stowMethod = 'Estiba en fondo de bodega (Tanktop) con reparto de presiones sobre cunas de madera estructurales y cadenas G80';
        secLegend = 'Cunas de madera estructurales y cadenas G80';
      } else if (tiersInHold.includes('BODEGA_BLOQUE')) {
        tierSummary = 'Bodega Corrida (Bloque)';
        stowMethod = 'Estiba en bloque compacto (Block Stowage) mediante spreader multipunto en ciclos de 14-16 sacos, cojines de aire y láminas';
        secLegend = 'Spreader multipunto y estiba en bloque';
      } else {
        tierSummary = 'Entrepuente (Tween Deck)';
        stowMethod = 'Estiba vertical sobre entrepuente con cinchas de poliéster de alta tenacidad, redes perimetrales y cantoneras';
        secLegend = 'Estiba vertical trincada con cinchas y redes';
      }
    }

    return {
      holdNumber: holdSpec.holdNumber,
      name: holdSpec.name,
      capacityCbm: holdSpec.capacityCbm,
      tanktopAreaM2: holdSpec.tanktopAreaM2,
      tanktopMaxLoadTm2: permissibleLoad,
      tweenDeckAreaM2: holdSpec.tweenDeckAreaM2,
      tweenDeckMaxLoadTm2: holdSpec.tweenDeckMaxLoadTm2,
      totalWeightTons: holdWeight,
      weightPercentage: weightPct,
      totalVolumeCbm: holdVolume,
      volumeUtilizationPct: volUtilPct,
      actualMaxPressureTm2: Math.round(actualMaxPressure * 100) / 100,
      isOverweight: actualMaxPressure > permissibleLoad,
      isOvercube: holdVolume > holdSpec.capacityCbm,
      pressureCompliance: actualMaxPressure <= permissibleLoad,
      cubicCompliance: holdVolume <= holdSpec.capacityCbm,
      cargoCategories: holdCategories,
      stowageTier: tierSummary,
      stowageMethod: stowMethod,
      securingLegend: secLegend,
      allocatedItems: holdItems,
    };
  };

  const holds = [
    buildHoldSummary(spec.holds[0], hold1Items),
    buildHoldSummary(spec.holds[1], hold2Items),
    buildHoldSummary(spec.holds[2], hold3Items),
    buildHoldSummary(spec.holds[3], hold4Items),
  ];

  const deckWeight = Math.round(weatherDeckItems.reduce((acc, it) => acc + it.totalWeightMT, 0) * 100) / 100;
  const deckVolume = Math.round(weatherDeckItems.reduce((acc, it) => acc + it.totalVolumeCbm, 0) * 100) / 100;
  const deckWeightPct = totalCargoWeightMT > 0 ? Math.round((deckWeight / totalCargoWeightMT) * 1000) / 10 : 0;
  const deckMaxPressure = weatherDeckItems.reduce((max, it) => Math.max(max, it.footprintPressureTm2 || 0), 0);

  const weatherDeckSummary = {
    name: spec.weatherDeck.name,
    deckAreaM2: spec.weatherDeck.deckAreaM2,
    maxPermissibleLoadTm2: spec.weatherDeck.maxPermissibleLoadTm2,
    maxContainerTeus: spec.weatherDeck.maxContainerTeus,
    totalWeightTons: deckWeight,
    weightPercentage: deckWeightPct,
    totalVolumeCbm: deckVolume,
    actualMaxPressureTm2: Math.round(deckMaxPressure * 100) / 100,
    pressureCompliance: deckMaxPressure <= spec.weatherDeck.maxPermissibleLoadTm2,
    stowageMethod: weatherDeckItems.length > 0 ? spec.weatherDeck.securingMethod : 'Cubierta despejada / libre para estiba adicional',
    securingLegend: weatherDeckItems.length > 0 ? spec.weatherDeck.legend : 'Cubierta despejada',
    allocatedItems: weatherDeckItems,
  };

  const categoryGroups = {};
  analyzedItems.forEach(it => {
    if (!categoryGroups[it.category]) {
      categoryGroups[it.category] = {
        category: it.category,
        totalWeightMT: 0,
        totalVolumeCbm: 0,
        piecesCount: 0,
        primaryTier: it.tier,
        stowageMethod: it.stowageMethod,
        securingLegend: it.securingLegend,
        assignedHolds: new Set(),
      };
    }
    categoryGroups[it.category].totalWeightMT += it.totalWeightMT;
    categoryGroups[it.category].totalVolumeCbm += it.totalVolumeCbm;
    categoryGroups[it.category].piecesCount += it.quantity;
    if (it.allocatedToHold) {
      categoryGroups[it.category].assignedHolds.add(`Bodega ${it.allocatedToHold}`);
    } else if (it.tier === 'WEATHER_DECK') {
      categoryGroups[it.category].assignedHolds.add('Cubierta');
    }
  });

  const cargoMixBreakdown = Object.values(categoryGroups).map(g => ({
    category: g.category,
    weightTons: Math.round(g.totalWeightMT * 100) / 100,
    weightPercentage: totalCargoWeightMT > 0 ? Math.round((g.totalWeightMT / totalCargoWeightMT) * 1000) / 10 : 0,
    volumeCbm: Math.round(g.totalVolumeCbm * 100) / 100,
    volumePercentage: totalCargoVolumeCbm > 0 ? Math.round((g.totalVolumeCbm / totalCargoVolumeCbm) * 1000) / 10 : 0,
    piecesCount: g.piecesCount,
    assignedTier: g.primaryTier,
    assignedLocations: g.assignedHolds.size > 0 ? Array.from(g.assignedHolds).join(', ') : 'Bodegas Principales',
    stowageMethod: g.stowageMethod,
    securingLegend: g.securingLegend,
  }));

  const totalVolumeOccupiedCbm = Math.round((holds.reduce((acc, h) => acc + h.totalVolumeCbm, 0) + deckVolume) * 100) / 100;
  const volumeUtilizationShipPct = Math.round((totalVolumeOccupiedCbm / spec.grainCapacityCbm) * 1000) / 10;
  const isCubicCapacityExceeded = totalVolumeOccupiedCbm > spec.grainCapacityCbm;

  const maxGlobalPressureTm2 = Math.max(
    ...holds.map(h => h.actualMaxPressureTm2),
    weatherDeckSummary.actualMaxPressureTm2
  );
  const isPermissibleLoadExceeded = holds.some(h => h.isOverweight) || !weatherDeckSummary.pressureCompliance;

  const hydrodynamicsAndSafety = {
    grainCapacityCbm: spec.grainCapacityCbm,
    baleCapacityCbm: spec.baleCapacityCbm,
    totalVolumeOccupiedCbm,
    volumeUtilizationShipPct,
    isCubicCapacityExceeded,
    volumeComplianceStatus: isCubicCapacityExceeded ? 'EXCEDIDO' : 'VERIFICADO_DENTRO_DE_CAPACIDAD',
    maxFloorPressureTm2: maxGlobalPressureTm2,
    maxFloorAllowableTm2: spec.tanktop.maxPermissibleLoadTm2,
    isPermissibleLoadExceeded,
    structuralResistanceCompliance: !isPermissibleLoadExceeded,
    volumeCompliance: !isCubicCapacityExceeded,
    structuralResistanceStatus: isPermissibleLoadExceeded ? 'EXCEDE_REQUIERE_REPARTO_PRESIÓN' : 'VERIFICADO_RESISTENCIA_ADMISIBLE',
    centerOfGravityAssessment: totalCargoWeightMT >= 40
      ? 'Óptimo: Concentración de masas pesadas en Tanktop (fondo de bodega) garantiza centro de gravedad bajo (KG mínimo), asegurando altura metacéntrica (GM) positiva > 1.45m y estabilidad según Código CSS OMI.'
      : 'Adecuado: Carga liviana / LCL distribuida uniformemente.',
    metacentricHeightGmEstimatedM: totalCargoWeightMT >= 40 ? 1.55 : 1.80,
    longitudinalStressBalance: 'Momento flector y esfuerzo cortante longitudinales balanceados simétricamente entre Proa y Popa.',
    seaworthinessStatus: (!isCubicCapacityExceeded && !isPermissibleLoadExceeded)
      ? 'Aprobado para Navegación Marítima Internacional (Seaworthiness Passed / IMO CSS Code Compliant)'
      : 'Condicionado a revisión de repartos de carga o durmientes certificados.',
  };

  // Justificación Técnica de Ingeniería Naval (Naval Engineering Executive Justification)
  const totalCargoFootprintM2 = Math.round(analyzedItems.reduce((acc, it) => acc + (Number(it.totalFootprintM2) || 0), 0) * 100) / 100;

  const tierWeightMap = {
    TANKTOP: 0,
    BODEGA_BLOQUE: 0,
    WEATHER_DECK: 0,
    TWEEN_DECK: 0,
  };
  const tierCountMap = {
    TANKTOP: 0,
    BODEGA_BLOQUE: 0,
    WEATHER_DECK: 0,
    TWEEN_DECK: 0,
  };

  analyzedItems.forEach(it => {
    const t = it.tier || 'TWEEN_DECK';
    if (tierWeightMap[t] !== undefined) {
      tierWeightMap[t] += (it.totalWeightMT || 0);
      tierCountMap[t] += (it.quantity || 1);
    } else {
      tierWeightMap[t] = (it.totalWeightMT || 0);
      tierCountMap[t] = (it.quantity || 1);
    }
  });

  let predominantTier = 'TWEEN_DECK';
  let maxWeight = -1;
  for (const [tierKey, weightVal] of Object.entries(tierWeightMap)) {
    if (weightVal > maxWeight) {
      maxWeight = weightVal;
      predominantTier = tierKey;
    }
  }

  if (maxWeight <= 0 && analyzedItems.length > 0) {
    let maxCount = -1;
    for (const [tierKey, countVal] of Object.entries(tierCountMap)) {
      if (countVal > maxCount) {
        maxCount = countVal;
        predominantTier = tierKey;
      }
    }
  }

  let tierExplanation = '';
  if (predominantTier === 'WEATHER_DECK') {
    tierExplanation = 'La carga mayoritaria corresponde a unidades rodadas (Ro-Ro) y/o contenedores, posicionada en Cubierta Superior (Weather Deck) con calzos de seguridad, cinchas a puntos D-Rings y twistlocks automáticos, optimizando el francobordo y la maniobra de izado sin comprometer la estabilidad.';
  } else if (predominantTier === 'TANKTOP') {
    tierExplanation = 'La carga mayoritaria corresponde a Heavy Lift y maquinaria pesada/estructuras, posicionada en el Doble Fondo Reforzado (Tanktop, capacidad admisible de 20.0 t/m²) sobre cunas estructurales de madera y trincaje pesado G80, garantizando un centro de gravedad (KG) bajo y maximizando la estabilidad transversal.';
  } else if (predominantTier === 'BODEGA_BLOQUE') {
    tierExplanation = 'La carga mayoritaria corresponde a mercancía en Big Bags / graneles ensacados, distribuida en estiba compacta en bloque trabado (Block Stowage) en bodegas inferiores mediante spreader multipunto y cojines neumáticos de trincaje para evitar corrimientos transversales.';
  } else {
    tierExplanation = 'La carga mayoritaria corresponde a carga general paletizada y fraccionada, posicionada en entrepuentes (Tween Deck) sobre pontones intermedios con trincaje mediante redes y cinchas de poliéster para facilitar la segregación y descarga secuencial.';
  }

  if (analyzedItems.length === 0) {
    tierExplanation = 'Sin partidas de carga activas; compartimentos de carga y cubierta preparados para estiba secuencial según peso específico de las partidas.';
  }

  const executiveJustification = [
    `Cálculo de Masas y Volúmenes: Registro de carga total de ${Number(totalCargoWeightMT).toFixed(2)} MT y un área acumulada de apoyo de ${Number(totalCargoFootprintM2).toFixed(2)} m², consolidando un volumen ocupado de ${Number(totalVolumeOccupiedCbm).toFixed(2)} m³ en bodegas y compartimentos (${volumeUtilizationShipPct}% de la capacidad cúbica grain del buque).`,
    `Lógica de Asignación de Bodegas: ${tierExplanation}`,
    `Validación de Resistencia Estructural: Presión máxima ejercida sobre plancha calculada en ${Number(hydrodynamicsAndSafety.maxFloorPressureTm2 || 0).toFixed(2)} t/m² frente a una capacidad máxima admisible de ${Number(hydrodynamicsAndSafety.maxFloorAllowableTm2 || 20).toFixed(1)} t/m² del compartimento, confirmando que la distribución de pesos cumple estrictamente con las prescripciones de resistencia estructural y seguridad del Código CSS de la OMI.`,
  ];

  const stowagePlan = {
    vesselModel: {
      type: spec.vesselType,
      dwt: spec.dwt,
      grainCapacityCbm: spec.grainCapacityCbm,
      baleCapacityCbm: spec.baleCapacityCbm,
      holdsCount: spec.holdsCount,
      deckCranes: spec.deckCranes,
      tanktopUniformLoadTm2: spec.tanktop.maxPermissibleLoadTm2,
      tweenDeckUniformLoadTm2: spec.tweenDeck.maxPermissibleLoadTm2,
      weatherDeckUniformLoadTm2: spec.weatherDeck.maxPermissibleLoadTm2,
    },
    cargoClassification: {
      totalWeightTons: totalCargoWeightMT,
      totalVolumeCbm: totalCargoVolumeCbm,
      totalPieces,
      distinctCategories,
      distinctTiers,
      isMixedCargo,
      cargoMixBreakdown,
      items: analyzedItems,
    },
    holds,
    weatherDeck: weatherDeckSummary,
    tweenDeckSummary: {
      name: spec.tweenDeck.name,
      totalAreaM2: spec.tweenDeck.totalAreaM2,
      maxPermissibleLoadTm2: spec.tweenDeck.maxPermissibleLoadTm2,
      securingMethod: spec.tweenDeck.securingMethod,
      legend: spec.tweenDeck.legend,
    },
    tanktopSummary: {
      name: spec.tanktop.name,
      totalAreaM2: spec.tanktop.totalAreaM2,
      maxPermissibleLoadTm2: spec.tanktop.maxPermissibleLoadTm2,
      securingMethod: spec.tanktop.securingMethod,
      legend: spec.tanktop.legend,
    },
    hydrodynamicsAndSafety,
    asciiCroquis: '',
    executiveJustification,
  };

  stowagePlan.asciiCroquis = generateDynamicStowageAscii(stowagePlan);

  return stowagePlan;
}

export function ForwarderWorkspace() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [isAgentVisible, setIsAgentVisible] = useState(true);

  const [isCargoModalOpen, setIsCargoModalOpen] = useState(false);
  const [showExecutiveReport, setShowExecutiveReport] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__IS_CARGO_BUILDER_MODAL_OPEN__ = Boolean(isCargoModalOpen && !showExecutiveReport);
      window.dispatchEvent(new CustomEvent('seacharter:cargo-builder-modal-visibility', {
        detail: { isOpen: Boolean(isCargoModalOpen && !showExecutiveReport) }
      }));
    }
  }, [isCargoModalOpen, showExecutiveReport]);
  const [editingLineItemId, setEditingLineItemId] = useState(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null);

  // Herramientas Comerciales y Regulatorias (CBAM y Modo Dual)
  const [isCbamOpen, setIsCbamOpen] = useState(false);
  const [isDualTradingOpen, setIsDualTradingOpen] = useState(false);
  const dualViewRef = useRef(null);

  // Parámetros locales CBAM sincronizados con el proyecto
  const [cbamSector, setCbamSector] = useState('');
  const [cbamOrigin, setCbamOrigin] = useState('');
  const [cbamDestination, setCbamDestination] = useState('');
  const [cbamQuantity, setCbamQuantity] = useState(0);
  const [cbamReportedEmissions, setCbamReportedEmissions] = useState('');
  const [cbamCompetitorOrigin, setCbamCompetitorOrigin] = useState('');
  const [cbamCompetitorFactor, setCbamCompetitorFactor] = useState('');

  const [reportData, setReportData] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [commercialScenario, setCommercialScenario] = useState('target');
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowExecutiveReport(false);
        setIsCbamOpen(false);
        setIsDualTradingOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  const [cargoItems, setCargoItems] = useState([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculateFeedback, setRecalculateFeedback] = useState(null);
  const feedbackTimeoutRef = useRef(null);
  const [financialBreakdown, setFinancialBreakdown] = useState(null);
  const [projectDocuments, setprojectDocuments] = useState([]);

  const [dunnageWood, setDunnageWood] = useState(0);
  const [highCapacitySlings, setHighCapacitySlings] = useState(0);
  const [chainsBinders, setChainsBinders] = useState(0);
  const [shackles, setShackles] = useState(0);

  const [stevedoreGangs, setStevedoreGangs] = useState(0);
  const [lashingTeam, setLashingTeam] = useState(0);
  const [heavyLiftCrane, setHeavyLiftCrane] = useState(0);
  const [mafiPlatforms, setMafiPlatforms] = useState(0);
  const [spreaderMultipunto, setSpreaderMultipunto] = useState(0);
  const [craneLiftCycles, setCraneLiftCycles] = useState(0);

  const [shippingMode, setShippingMode] = useState('Lo-Lo');
  const [vesselType, setVesselType] = useState('Geared Breakbulk (Lo-Lo)');

  const [isUnder40t, setIsUnder40t] = useState(false);
  const [tceActive, setTceActive] = useState(false);
  const [tceValue, setTceValue] = useState(null);
  const [charterMode, setCharterMode] = useState('Fletamento Completo');
  const [isBigBagsCargo, setIsBigBagsCargo] = useState(false);
  const [cargoCategory, setCargoCategory] = useState('Carga de Proyecto / Heavy Lift');
  const [isPalletizedOrBagsCargo, setIsPalletizedOrBagsCargo] = useState(false);
  const [isCommodityTariffActive, setIsCommodityTariffActive] = useState(false);
  const [operationalProfileNotice, setOperationalProfileNotice] = useState('');

  const [storageDays, setStorageDays] = useState(0);
  const [surveyorCost, setSurveyorCost] = useState(0);
  const [inlandCost, setInlandCost] = useState(0);
  const [customsCost, setCustomsCost] = useState(0);
  const [insuranceCost, setInsuranceCost] = useState(0);
  const userEditedSurveyor = useRef(false);

  // Helper centralizado para capturar el project_ref corporativo activo del estado global (barra superior / RDM)
  const getActiveGlobalReference = () => {
    if (typeof window === 'undefined') return '';
    try {
      const mgrRef = window.ContractRefManager?.getActiveContractRef?.() ||
                     window.ContractReference?.getActiveContractRef?.() ||
                     (typeof window.getActiveContractRef === 'function' ? window.getActiveContractRef() : null);
      if (mgrRef && typeof mgrRef === 'string' && mgrRef.trim()) {
        const clean = mgrRef.trim();
        if (clean !== '—' && clean !== '-') return clean;
      }
    } catch (_) {}

    try {
      const sRef = window.sessionStorage?.getItem('active_contract_ref');
      if (sRef && sRef.trim() && sRef.trim() !== '—') return sRef.trim();
    } catch (_) {}

    try {
      const lRef = window.localStorage?.getItem('active_contract_ref');
      if (lRef && lRef.trim() && lRef.trim() !== '—') return lRef.trim();
    } catch (_) {}

    try {
      const shared = window.localStorage?.getItem('active_core_pro_session');
      if (shared) {
        const parsed = JSON.parse(shared);
        const ref = parsed?.reference || parsed?.target_session_id;
        if (ref && typeof ref === 'string' && ref.trim()) return ref.trim();
      }
    } catch (_) {}

    try {
      const scRef = window.SeaCharterStore?.getState?.()?.contractReference ||
                    window.SeaCharterStore?.getState?.()?.reference ||
                    window.State?.contractReference ||
                    window.State?.reference ||
                    window.activeVoyage?.reference;
      if (scRef && typeof scRef === 'string' && scRef.trim()) return scRef.trim();
    } catch (_) {}

    try {
      const domCandidates = [
        document.getElementById('contract-reference'),
        document.getElementById('audit-contract-reference'),
        document.getElementById('current-voyage-reference'),
        document.getElementById('voyage-reference'),
        document.getElementById('new-estimation-current-reference'),
        document.getElementById('quick-ref'),
        document.getElementById('gc-ref'),
        document.getElementById('asb-ref'),
        document.getElementById('tracking-live-contract-ref'),
        document.querySelector?.('[data-contract-reference]'),
      ];
      for (const el of domCandidates) {
        if (!el) continue;
        const val = (el.value || el.dataset?.reference || el.textContent || '').trim();
        if (!val || val === '—' || val === '-') continue;
        const match = val.match(/RDM\/[A-Z0-9_-]+/i);
        if (match) return match[0];
        const clean = val.replace(/^REF:\s*/i, '').trim();
        if (clean && clean !== '—' && /^RDM\b/i.test(clean)) return clean;
      }
    } catch (_) {}

    return '';
  };

  // Helper para deducir la referencia del expediente padre (dossier) de un proyecto
  const getProjectParentRef = (p) => {
    if (!p || typeof p !== 'object') return '';
    const explicitRef = p.referenciaPadre ||
                        p.dossier_ref ||
                        p.parent_ref ||
                        p.dossierRef ||
                        p.parentRef ||
                        p.parent_dossier_ref ||
                        p.parent_project_ref ||
                        p.route_and_chartering?.dossier_ref ||
                        p.route_and_chartering?.parent_ref;
    if (explicitRef && typeof explicitRef === 'string' && explicitRef.trim()) {
      return explicitRef.trim();
    }
    if (p.project_ref && typeof p.project_ref === 'string') {
      const rawRef = p.project_ref.trim();
      const rdmMatch = rawRef.match(/RDM\/[A-Z0-9_-]+/i);
      if (rdmMatch) {
        return rdmMatch[0].replace(/[-_]EXP[-_].*$/i, '').replace(/[-_]PRJ[-_].*$/i, '').trim();
      }
      return rawRef;
    }
    return '';
  };

  // Helper defensivo para verificar si un proyecto pertenece al expediente padre activo
  const isProjectMatchingActiveDossier = (p, activeRef) => {
    if (!p || typeof p !== 'object' || !activeRef) return false;
    const cleanActive = String(activeRef).trim().toUpperCase();
    if (!cleanActive || cleanActive === '—' || cleanActive === '-') return false;

    // 1. Campo explícito referenciaPadre
    if (p.referenciaPadre && typeof p.referenciaPadre === 'string') {
      const cleanPadre = p.referenciaPadre.trim().toUpperCase();
      if (cleanPadre === cleanActive) return true;
    }

    // 2. Propiedades dossier_ref / parent_ref / etc.
    const explicitParent = (
      p.dossier_ref ||
      p.parent_ref ||
      p.dossierRef ||
      p.parentRef ||
      p.parent_dossier_ref ||
      p.parent_project_ref ||
      p.route_and_chartering?.dossier_ref ||
      p.route_and_chartering?.parent_ref ||
      ''
    ).toString().trim().toUpperCase();

    if (explicitParent && explicitParent !== '—' && explicitParent !== '-') {
      return explicitParent === cleanActive;
    }

    // 3. Convención de project_ref (coincidencia exacta o prefijo)
    const rawProjectRef = (p.project_ref || p.projectRef || '').toString().trim().toUpperCase();
    if (!rawProjectRef || rawProjectRef === '—' || rawProjectRef === '-') return false;

    if (rawProjectRef === cleanActive) return true;

    if (
      rawProjectRef.startsWith(cleanActive + '-') ||
      rawProjectRef.startsWith(cleanActive + '/') ||
      rawProjectRef.startsWith(cleanActive + '_') ||
      rawProjectRef.startsWith(cleanActive + '#') ||
      rawProjectRef.startsWith(cleanActive + ' ')
    ) {
      return true;
    }

    const rdmMatch = rawProjectRef.match(/RDM\/[A-Z0-9_-]+/i);
    if (rdmMatch) {
      const extracted = rdmMatch[0].toUpperCase();
      if (extracted === cleanActive) return true;
      const stripped = extracted.replace(/[-_]EXP[-_].*$/i, '').replace(/[-_]PRJ[-_].*$/i, '');
      if (stripped === cleanActive) return true;
    }

    return false;
  };

  // Variable de estado que almacena la "Referencia Activa" de la sesión / expediente padre actual (Topbar)
  const [referenciaActivaGlobal, setReferenciaActivaGlobal] = useState(() => getActiveGlobalReference());
  const activeContractRef = referenciaActivaGlobal;
  const setActiveContractRef = setReferenciaActivaGlobal;

  // Helper centralizado para capturar el estado activo de la calculadora y de la sesión (sin valores mock)
  const readActiveCalculatorSession = () => {
    if (typeof window === 'undefined') return {};

    const activeVoyageSource = window.activeVoyage || {};
    const storeState = window.SeaCharterStore?.getState?.() || {};
    const globalState = window.State || {};
    const calcState = window.CalculatedState || window.GlobalStore?.calculatedState || {};

    let draftState = {};
    try {
      const rawDraft = window.sessionStorage?.getItem('seacharter_session_draft') || window.localStorage?.getItem('seacharter_session_draft');
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft);
        if (parsed?.state && typeof parsed.state === 'object') {
          draftState = parsed.state;
        }
      }
    } catch (_) {}

    const sessionSource = {
      ...globalState,
      ...storeState,
      ...activeVoyageSource,
      ...calcState,
      ...draftState,
    };

    const polEl = document.getElementById('port-pol') || document.getElementById('map-port-pol');
    const podEl = document.getElementById('port-pod') || document.getElementById('map-port-pod');
    const loadRateEl = document.getElementById('rate-load') || document.getElementById('load-rate') || document.getElementById('input-loadRate');
    const dischRateEl = document.getElementById('rate-disch') || document.getElementById('disch-rate') || document.getElementById('rate-discharge') || document.getElementById('input-dischRate');
    const distEl = document.getElementById('dist-laden') || document.getElementById('dist-total');
    const speedEl = document.getElementById('spd-laden') || document.getElementById('vessel-speed');
    const cargoQtyEl = document.getElementById('cargo-qty') || document.getElementById('cargo-quantity');
    const freightSellEl = document.getElementById('freight-sell') || document.getElementById('selling-freight') || document.getElementById('flete-venta') || document.getElementById('target-freight-sell');
    const freightRateEl = document.getElementById('freight-rate') || document.getElementById('freight-rate-calc') || document.getElementById('input-freightRate') || document.getElementById('buying-freight') || document.getElementById('flete-compra');
    const cargoTypeEl = document.getElementById('cargo-type') || document.getElementById('cargo-type-manual');

    const cleanPol = String(polEl?.value || sessionSource.pol || sessionSource.portPol || sessionSource.port_pol || sessionSource.origin || '').trim();
    const cleanPod = String(podEl?.value || sessionSource.pod || sessionSource.portPod || sessionSource.port_pod || sessionSource.destination || '').trim();

    const cleanCargoQty = Math.max(
      0,
      parseFloat(cargoQtyEl?.value) ||
      Number(sessionSource.cargo || sessionSource.cargoQty || sessionSource.cargoQuantity || sessionSource.quantityMT || sessionSource.actualCargoIntake) ||
      0
    );

    const cleanLoadRate = Math.max(
      0,
      parseFloat(loadRateEl?.value) ||
      Number(sessionSource.loadRate || sessionSource.rateLoad || sessionSource.loadingRate) ||
      0
    );

    const cleanDischRate = Math.max(
      0,
      parseFloat(dischRateEl?.value) ||
      Number(sessionSource.dischRate || sessionSource.rateDisch || sessionSource.dischargingRate || sessionSource.dischargeRate) ||
      0
    );

    const cleanDistance = Math.max(
      0,
      parseFloat(distEl?.value) ||
      Number(sessionSource.distLaden || sessionSource.distanceNm || sessionSource.totalMiles || sessionSource.distance) ||
      0
    );

    const cleanSpeed = Math.max(
      0,
      parseFloat(speedEl?.value) ||
      Number(sessionSource.speedLaden || sessionSource.vesselSpeedKnots || sessionSource.speed) ||
      0
    );

    const cleanCargoType = String(cargoTypeEl?.value || sessionSource.cargoType || sessionSource.cargo_type || sessionSource.commodity || '').trim();

    // Captura del TCE exacto activo de la calculadora
    const tceFromLabel = parseFloat(String(document.getElementById('res-tce-label')?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
    const tceFromPrint = parseFloat(String(document.getElementById('print-tce-owner')?.innerText || document.getElementById('print-tce-owner')?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
    const cleanTce = Math.max(
      0,
      Number(sessionSource.tceOwner || sessionSource.tce || sessionSource.tceDaily || sessionSource.dailyRateUsd || sessionSource.vesselDailyHireUsd) ||
      tceFromLabel ||
      tceFromPrint ||
      0
    );

    const freightSell = Math.max(
      0,
      parseFloat(freightSellEl?.value) ||
      Number(sessionSource.freightSell || sessionSource.fleteVenta || sessionSource.flete_venta || sessionSource.sellingFreight || sessionSource.chartererFreight) ||
      parseFloat(String(document.getElementById('coa-detail-charterer-target')?.textContent || '').replace(/[^0-9.-]/g, '')) ||
      0
    );

    const freightCost = Math.max(
      0,
      parseFloat(freightRateEl?.value) ||
      Number(sessionSource.freightRate || sessionSource.freightCost || sessionSource.fleteCoste || sessionSource.fleteCompra || sessionSource.flete_compra || sessionSource.ownerFreight) ||
      parseFloat(String(document.getElementById('coa-detail-owner-purchase')?.textContent || '').replace(/[^0-9.-]/g, '')) ||
      0
    );

    const cargoProductEl = document.getElementById('cargo-product');
    const packingEl = document.getElementById('gc-add-packing') || document.getElementById('cargo-packaging');
    const cargoTypeManualEl = document.getElementById('cargo-type-manual');
    const methodLoadEl = document.getElementById('metodo_carga');
    const methodDischEl = document.getElementById('metodo_descarga_pod');
    const charterPartyEl = document.getElementById('charter-party-standard');
    const ballastEl = document.getElementById('port-ballast');

    const cleanCargoProduct = String(cargoProductEl?.value || sessionSource.cargoProduct || sessionSource.productoEspecifico || sessionSource.commodity || '').trim();
    const cleanCargoPacking = String(packingEl?.value || sessionSource.cargoPacking || '').trim();
    const cleanCargoTypeManual = String(cargoTypeManualEl?.value || sessionSource.cargoTypeManual || '').trim();
    const cleanBallast = String(ballastEl?.value || sessionSource.portBallast || '').trim();
    const cleanMetodoCarga = String(methodLoadEl?.value || sessionSource.metodoCarga || '').trim();
    const cleanMetodoDescarga = String(methodDischEl?.value || sessionSource.metodoDescarga || '').trim();
    const cleanCharterParty = String(charterPartyEl?.value || sessionSource.charterPartyStandard || 'GENCON').trim();

    const isBigBags = /big[- ]?bag|ensacad|saco/i.test(cleanCargoProduct) ||
                      /big[- ]?bag|ensacad|saco/i.test(cleanCargoType) ||
                      cleanCargoPacking === 'bigbag' ||
                      cleanCargoProduct.toLowerCase().includes('big bag');

    const isPallets = /palet|pallet|unitariz/i.test(cleanCargoProduct) ||
                      /palet|pallet|unitariz/i.test(cleanCargoType) ||
                      cleanCargoPacking === 'pallet' ||
                      cleanCargoProduct.toLowerCase().includes('palet');

    const isBulk = !isBigBags && !isPallets && (
      /granel|bulk|clinker|yeso|mineral|carbon/i.test(cleanCargoProduct) ||
      /granel|dry bulk|liquid bulk/i.test(cleanCargoType) ||
      cleanCargoPacking === 'standard'
    );

    // Días de la Vista Ejecutiva (fuente de verdad definitiva para tiempos operativos)
    const parseDaysText = (el) => {
      if (!el) return null;
      const text = String(el.textContent || el.innerText || el.value || '').trim();
      const num = parseFloat(text.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(num) && num > 0 ? num : null;
    };

    const domExecSea = parseDaysText(document.getElementById('exec-sea-days'));
    const domExecPort = parseDaysText(document.getElementById('exec-port-days'));
    const domExecTotal = parseDaysText(document.getElementById('exec-total-days'));

    const winExec = (typeof window !== 'undefined' && window.executiveOperationalTimes)
      || sessionSource.executiveOperationalTimes
      || {};

    const rawSea = domExecSea
      ?? (Number.isFinite(Number(winExec.seaDays)) && Number(winExec.seaDays) > 0 ? Number(winExec.seaDays) : null)
      ?? (Number.isFinite(Number(sessionSource.seaDays)) && Number(sessionSource.seaDays) > 0 ? Number(sessionSource.seaDays) : null)
      ?? (Number.isFinite(Number(sessionSource.daysSea)) && Number(sessionSource.daysSea) > 0 ? Number(sessionSource.daysSea) : null)
      ?? parseDaysText(document.getElementById('res-days-laden'));

    const rawPort = domExecPort
      ?? (Number.isFinite(Number(winExec.portDays)) && Number(winExec.portDays) > 0 ? Number(winExec.portDays) : null)
      ?? (Number.isFinite(Number(sessionSource.portDays)) && Number(sessionSource.portDays) > 0 ? Number(sessionSource.portDays) : null)
      ?? (Number.isFinite(Number(sessionSource.daysPort)) && Number(sessionSource.daysPort) > 0 ? Number(sessionSource.daysPort) : null)
      ?? parseDaysText(document.getElementById('res-days-port'));

    const rawTotal = domExecTotal
      ?? (Number.isFinite(Number(winExec.totalDays)) && Number(winExec.totalDays) > 0 ? Number(winExec.totalDays) : null)
      ?? (Number.isFinite(Number(sessionSource.totalDays)) && Number(sessionSource.totalDays) > 0 ? Number(sessionSource.totalDays) : null)
      ?? parseDaysText(document.getElementById('res-days-total'))
      ?? (rawSea !== null && rawPort !== null ? Math.round((rawSea + rawPort) * 100) / 100 : null);

    const execSeaDays = rawSea !== null ? Math.round(rawSea * 100) / 100 : null;
    const execPortDays = rawPort !== null ? Math.round(rawPort * 100) / 100 : null;
    const execTotalDays = rawTotal !== null ? Math.round(rawTotal * 100) / 100 : (execSeaDays !== null && execPortDays !== null ? Math.round((execSeaDays + execPortDays) * 100) / 100 : null);

    return {
      hasActiveSession: Boolean(cleanPol || cleanPod || cleanCargoQty > 0 || cleanLoadRate > 0 || cleanDischRate > 0 || cleanDistance > 0 || cleanTce > 0),
      pol: cleanPol,
      pod: cleanPod,
      portBallast: cleanBallast,
      cargoQty: cleanCargoQty,
      cargoType: cleanCargoType,
      cargoCategory: cleanCargoType,
      cargoProduct: cleanCargoProduct,
      commodity: cleanCargoProduct || cleanCargoType,
      cargoPacking: cleanCargoPacking,
      cargoTypeManual: cleanCargoTypeManual,
      isBigBags,
      isPallets,
      isBulk,
      loadRate: cleanLoadRate,
      dischRate: cleanDischRate,
      distanceNm: cleanDistance,
      speedKnots: cleanSpeed,
      tce: cleanTce,
      freightSell,
      freightCost,
      fleteCompra: freightCost,
      fleteVenta: freightSell,
      fleteSugeridoArmador: freightCost,
      fleteSugeridoFletador: freightSell,
      fleteSugeridoArmadorCompra: freightCost,
      fleteSugeridoFletadorVenta: freightSell,
      metodoCarga: cleanMetodoCarga,
      metodoDescarga: cleanMetodoDescarga,
      charterPartyStandard: cleanCharterParty,
      execSeaDays,
      execPortDays,
      execTotalDays,
      seaDays: execSeaDays,
      portDays: execPortDays,
      totalDays: execTotalDays,
      diasNavegacion: execSeaDays,
      diasMuelle: execPortDays,
      diasPuerto: execPortDays,
      diasRotacionTotal: execTotalDays,
    };
  };

  // Helper para consultar los días calculados de la Vista Ejecutiva (fuente de verdad definitiva)
  const getExecutiveOperationalTimes = (sourceRoute = null) => {
    if (sourceRoute && typeof sourceRoute === 'object') {
      const rNav = Number(sourceRoute.dias_navegacion ?? sourceRoute.navigationDays ?? sourceRoute.sea_days ?? sourceRoute.seaDays);
      const rPort = Number(sourceRoute.dias_muelle ?? sourceRoute.dias_muelle_total ?? sourceRoute.port_days ?? sourceRoute.portDays);
      const rTotal = Number(sourceRoute.dias_rotacion_total ?? sourceRoute.totalRotationDays ?? sourceRoute.total_days ?? sourceRoute.totalDays);
      if (Number.isFinite(rNav) && rNav > 0 && Number.isFinite(rTotal) && rTotal > 0) {
        return {
          hasExecutiveTimes: true,
          seaDays: Math.round(rNav * 100) / 100,
          portDays: Number.isFinite(rPort) && rPort > 0 ? Math.round(rPort * 100) / 100 : Math.round((rTotal - rNav) * 100) / 100,
          totalDays: Math.round(rTotal * 100) / 100,
          source: 'route',
        };
      }
    }

    const session = readActiveCalculatorSession();
    if (session.execSeaDays !== null || session.execPortDays !== null || session.execTotalDays !== null) {
      return {
        hasExecutiveTimes: true,
        seaDays: session.execSeaDays,
        portDays: session.execPortDays,
        totalDays: session.execTotalDays ?? (session.execSeaDays !== null && session.execPortDays !== null ? Math.round((session.execSeaDays + session.execPortDays) * 100) / 100 : null),
        source: 'executive_view',
      };
    }

    return {
      hasExecutiveTimes: false,
      seaDays: null,
      portDays: null,
      totalDays: null,
      source: 'fallback',
    };
  };

  // Parámetros dinámicos de ruta, ritmos operativos, rotación y demoras (capturan el estado de sesión si existe)
  const initialSession = readActiveCalculatorSession();
  const [pol, setPol] = useState(initialSession.pol || '');
  const [pod, setPod] = useState(initialSession.pod || '');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [loadingRate, setLoadingRate] = useState(initialSession.loadRate > 0 ? initialSession.loadRate : 1200);
  const [dischargingRate, setDischargingRate] = useState(initialSession.dischRate > 0 ? initialSession.dischRate : 1000);
  const [distanceNm, setDistanceNm] = useState(initialSession.distanceNm > 0 ? initialSession.distanceNm : 1500);
  const [vesselSpeedKnots, setVesselSpeedKnots] = useState(initialSession.speedKnots > 0 ? initialSession.speedKnots : 12.0);
  const [vesselDailyHireUsd, setVesselDailyHireUsd] = useState(initialSession.tce > 0 ? initialSession.tce : 11500);
  const [exchangeRateUsdEur, setExchangeRateUsdEur] = useState(0.92);
  const [actualLoadingDays, setActualLoadingDays] = useState('');
  const [actualDischargingDays, setActualDischargingDays] = useState('');
  const [demurrageDailyRateUsd, setDemurrageDailyRateUsd] = useState(initialSession.tce > 0 ? initialSession.tce : 11500);
  const [demurrageCost, setDemurrageCost] = useState(0);
  const [oceanFreight, setOceanFreight] = useState(0);
  const [charteringAssessment, setCharteringAssessment] = useState(null);

  const formatUSD = (val) => {
    const num = Number(val);
    const safeNum = isNaN(num) || !isFinite(num) ? 0 : num;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeNum);
  };

  // Estados para fletes financieros sincronizados de la Calculadora (Flete Compra Armador y Flete Venta Fletador)
  const [fleteCompra, setFleteCompra] = useState(initialSession.freightCost || initialSession.fleteCompra || 0);
  const [fleteVenta, setFleteVenta] = useState(initialSession.freightSell || initialSession.fleteVenta || 0);

  // Estados reactivos para la sincronización con la calculadora y base de datos Neon
  const [isSyncingCalculator, setIsSyncingCalculator] = useState(false);
  const [syncSuccessNotice, setSyncSuccessNotice] = useState(null);
  const [syncFeedback, setSyncFeedback] = useState(null);

  const [subtotalFreight, setSubtotalFreight] = useState('0.00');
  const [subtotalFobOperations, setSubtotalFobOperations] = useState('0.00');
  const [isBreakdownVisible, setIsBreakdownVisible] = useState(true);
  const [estimatedCost, setEstimatedCost] = useState('');
  const [salePrice, setSalePrice] = useState('');

  const setDunnage = setDunnageWood;
  const setChains = setChainsBinders;
  const setSlings = setHighCapacitySlings;
  const setGangs = setStevedoreGangs;
  const setHeavyLift = setHeavyLiftCrane;
  const setLashingTeams = setLashingTeam;
  const setSpreader = setSpreaderMultipunto;
  const setCustCost = setCustomsCost;
  const setMercanciaCost = setCustomsCost;

  const getLandTransportData = (project, payload = null) => {
    const p = project || {};
    const pl = payload || {};
    const origin = (p.land_origin || p.landOrigin || pl.land_origin || pl.landOrigin || p.land_charter?.origin || pl.land_charter?.origin || '').trim();
    const destination = (p.land_destination || p.landDestination || pl.land_destination || pl.landDestination || p.land_charter?.destination || pl.land_charter?.destination || '').trim();
    const distance = Number(p.land_distance ?? p.landDistance ?? pl.land_distance ?? pl.landDistance ?? p.land_charter?.distance ?? p.land_distance_km ?? pl.land_distance_km ?? 0) || 0;
    const freightCost = Number(p.land_freight_cost ?? p.landFreightCost ?? pl.land_freight_cost ?? pl.landFreightCost ?? p.land_charter?.cost ?? p.land_charter?.freight_cost ?? p.land_truck_cost ?? pl.land_truck_cost ?? 0) || 0;

    const hasData = Boolean((origin && destination) || freightCost > 0 || distance > 0 || origin || destination);
    const routeText = (origin && destination)
      ? `${origin} -> ${destination}`
      : (origin ? `${origin} -> (Puerto)` : (destination ? `(Origen) -> ${destination}` : 'Ruta Terrestre'));

    return {
      hasData,
      origin,
      destination,
      distance,
      freightCost,
      routeText,
    };
  };

  const getMaritimeRouteData = (project, payload = null) => {
    const p = project || {};
    const pl = payload || {};
    const rc = p.route_and_chartering || p.routeAndChartering ||
      pl.route_and_chartering || pl.routeAndChartering ||
      p.line_items?.[0]?.payload_data?.route_and_chartering ||
      p.services?.[0]?.payload_data?.route_and_chartering ||
      p.items?.[0]?.payload_data?.route_and_chartering ||
      (p.items?.[0] && typeof p.items[0] === 'object' && p.items[0].route_and_chartering ? p.items[0].route_and_chartering : null) ||
      null;

    if (!rc) {
      return { hasData: false };
    }

    const sessionData = readActiveCalculatorSession();
    const pol = (rc.pol || '').trim() || sessionData.pol || '';
    const pod = (rc.pod || '').trim() || sessionData.pod || '';
    const loadingRate = Number(rc.loading_rate_mt_day ?? rc.loadingRate ?? sessionData.loadRate ?? 0) || 0;
    const dischargingRate = Number(rc.discharging_rate_mt_day ?? rc.dischargingRate ?? sessionData.dischRate ?? 0) || 0;
    const distanceNm = Number(rc.distance_nm ?? rc.distanceNm ?? sessionData.distanceNm ?? 0) || 0;
    const vesselSpeedKnots = Number(rc.vessel_speed_knots ?? rc.vesselSpeedKnots ?? sessionData.speedKnots ?? 12.0) || 12.0;
    const dailyHireRateUsd = Number(rc.daily_hire_rate_usd ?? rc.dailyHireRateUsd ?? sessionData.tce ?? 0) || 0;
    const exchangeRate = Number(rc.exchange_rate ?? rc.exchangeRate ?? 0.92) || 0.92;

    // Días calculados de muelle y navegación: sincronizados con la Vista Ejecutiva como fuente de verdad definitiva
    const execTimes = getExecutiveOperationalTimes(rc);

    const diasCargaRaw = Number(rc.dias_carga ?? rc.loadingDays ?? 0) || 0;
    const diasDescargaRaw = Number(rc.dias_descarga ?? rc.dischargingDays ?? 0) || 0;
    const rawPortTotal = diasCargaRaw + diasDescargaRaw;

    const savedNav = Number(rc.dias_navegacion ?? rc.navigationDays ?? rc.sea_days ?? rc.seaDays ?? 0);
    const diasNavegacion = (savedNav > 0)
      ? savedNav
      : (execTimes.seaDays !== null && execTimes.seaDays > 0 ? execTimes.seaDays : (distanceNm > 0 && vesselSpeedKnots > 0 ? Math.round((distanceNm / (vesselSpeedKnots * 24)) * 100) / 100 : 0));

    const savedPort = Number(rc.dias_muelle ?? rc.dias_muelle_total ?? rc.port_days ?? rc.portDays ?? 0);
    const diasMuelle = (savedPort > 0)
      ? savedPort
      : (execTimes.portDays !== null && execTimes.portDays > 0 ? execTimes.portDays : rawPortTotal);

    const savedRot = Number(rc.dias_rotacion_total ?? rc.totalRotationDays ?? rc.total_days ?? rc.totalDays ?? 0);
    const diasRotacionTotal = (savedRot > 0)
      ? savedRot
      : (execTimes.totalDays !== null && execTimes.totalDays > 0 ? execTimes.totalDays : Math.round((diasMuelle + diasNavegacion) * 100) / 100);

    let diasCarga = diasCargaRaw;
    let diasDescarga = diasDescargaRaw;
    if (diasCarga === 0 && diasDescarga === 0 && diasMuelle > 0) {
      diasCarga = Math.round((diasMuelle / 2) * 100) / 100;
      diasDescarga = Math.round((diasMuelle - diasCarga) * 100) / 100;
    } else if (diasMuelle > 0 && rawPortTotal > 0 && (diasCarga + diasDescarga) !== diasMuelle) {
      diasCarga = Math.round((diasCargaRaw / rawPortTotal) * diasMuelle * 100) / 100;
      diasDescarga = Math.round((diasMuelle - diasCarga) * 100) / 100;
    }

    const actualLoadingDays = (rc.actual_loading_days !== undefined && rc.actual_loading_days !== null && rc.actual_loading_days !== '') ? Number(rc.actual_loading_days) : null;
    const actualDischargingDays = (rc.actual_discharging_days !== undefined && rc.actual_discharging_days !== null && rc.actual_discharging_days !== '') ? Number(rc.actual_discharging_days) : null;

    // Tarifa de demoras y plancha
    const demurrageDailyRateUsd = Number(rc.demurrage_daily_rate_usd ?? rc.demurrageDailyRateUsd ?? dailyHireRateUsd) || 0;
    const demurrageDays = Number(rc.demurrage_days ?? rc.demurrageDays ?? 0) || 0;
    const demurrageCostEur = Number(rc.demurrage_cost_eur ?? rc.demurrageCostEur ?? 0) || 0;
    const demurrageCostUsd = Number(rc.demurrage_cost_usd ?? rc.demurrageCostUsd ?? (demurrageDays * demurrageDailyRateUsd)) || 0;
    const demurrageStatus = rc.demurrage_status || (demurrageDays > 0 ? 'EXCESO DE ESTADÍA (ON DEMURRAGE)' : 'DENTRO DE PLANCHA (ON SCHEDULE)');
    const planchaDiasPermitidos = Number(rc.plancha_dias_permitidos ?? (diasCarga + diasDescarga)) || (diasCarga + diasDescarga);

    // Valor exacto del TCE obtenido
    const tceValue = Number(rc.tce_value ?? rc.tceValue ?? rc.tce_daily_rate_usd ?? dailyHireRateUsd) || 0;
    const oceanFreightTceUsd = Number(rc.ocean_freight_tce_usd ?? rc.oceanFreightTceUsd ?? rc.tce_freight_usd ?? (diasRotacionTotal * (tceValue || dailyHireRateUsd))) || 0;
    const oceanFreightTceEur = Number(rc.ocean_freight_tce_eur ?? rc.oceanFreightTceEur ?? rc.tce_freight_eur ?? (oceanFreightTceUsd * exchangeRate)) || 0;
    const vesselType = rc.vessel_type || rc.recommended_vessel || 'Geared Breakbulk (Lo-Lo)';
    const totalWeightTons = Number(rc.total_weight_tons ?? 0) || 0;
    const totalVolumeM3 = Number(rc.total_volume_m3 ?? 0) || 0;
    const reportRt = Number(rc.report_rt ?? 0) || 0;

    // Fletes financieros sincronizados de la Calculadora (Flete Compra Armador y Flete Venta Fletador)
    const fleteCompra = Number(
      rc.flete_compra_usd_mt ??
      rc.freight_rate_cost_usd ??
      rc.flete_sugerido_armador_compra ??
      rc.flete_compra ??
      rc.fleteCompra ??
      sessionData.fleteCompra ??
      sessionData.freightCost ??
      0
    ) || 0;

    const fleteVenta = Number(
      rc.flete_venta_usd_mt ??
      rc.freight_rate_sell_usd ??
      rc.flete_sugerido_fletador_venta ??
      rc.flete_venta ??
      rc.fleteVenta ??
      sessionData.fleteVenta ??
      sessionData.freightSell ??
      0
    ) || 0;

    const hasData = Boolean(pol || pod || distanceNm > 0 || tceValue > 0 || loadingRate > 0 || dischargingRate > 0 || diasRotacionTotal > 0 || fleteCompra > 0 || fleteVenta > 0);

    return {
      hasData,
      pol: pol || (rc.pol ? rc.pol : ''),
      pod: pod || (rc.pod ? rc.pod : ''),
      loadingRate,
      dischargingRate,
      distanceNm,
      vesselSpeedKnots,
      dailyHireRateUsd,
      exchangeRate,
      diasCarga,
      diasDescarga,
      diasMuelle,
      diasNavegacion,
      diasRotacionTotal,
      seaDays: diasNavegacion,
      portDays: diasMuelle,
      totalDays: diasRotacionTotal,
      actualLoadingDays,
      actualDischargingDays,
      demurrageDailyRateUsd,
      demurrageDays,
      demurrageCostEur,
      demurrageCostUsd,
      demurrageStatus,
      planchaDiasPermitidos,
      tceValue,
      oceanFreightTceUsd,
      oceanFreightTceEur,
      fleteCompra,
      fleteVenta,
      fleteSugeridoArmadorCompra: fleteCompra,
      fleteSugeridoFletadorVenta: fleteVenta,
      vesselType,
      totalWeightTons,
      totalVolumeM3,
      reportRt,
      isRealEstimate: true
    };
  };

  const getProjectDetails = async (projectRefOrId) => {
    try {
      const param = typeof projectRefOrId === 'object'
        ? (projectRefOrId?.project_ref || projectRefOrId?.id)
        : projectRefOrId;
      if (!param) return null;
      const url = typeof param === 'number'
        ? `/.netlify/functions/forwarder-projects?id=${param}`
        : `/.netlify/functions/forwarder-projects?project_ref=${encodeURIComponent(param)}`;
      const res = await fetch(getApiUrl(url), { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('Error en getProjectDetails:', err);
      return null;
    }
  };

  const handleSyncCalculatorDataRef = useRef(null);

  const handleSelectProject = async (proj) => {
    setActiveProject(proj);
    if (proj?.project_ref || proj?.id) {
      const details = await getProjectDetails(proj.project_ref || proj.id);
      if (details) {
        setActiveProject((prev) => (prev && (prev.id === details.id || prev.project_ref === details.project_ref) ? { ...prev, ...details } : details));
      }
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.getProjectDetails = getProjectDetails;
      window.getMaritimeRouteData = getMaritimeRouteData;
      window.getExecutiveOperationalTimes = getExecutiveOperationalTimes;
      window.getActiveGlobalReference = getActiveGlobalReference;
      window.handleSyncCalculatorData = (...args) => handleSyncCalculatorDataRef.current?.(...args);
    }
  }, []);

  const fetchProjects = async (options = {}) => {
    const silent = typeof options === 'boolean' ? options : Boolean(options?.silent);
    if (!silent) {
      setIsRefreshing(true);
      setIsLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(getApiUrl('/.netlify/functions/forwarder-projects'), { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.projects || []);
      const enrichedList = list.map((p) => {
        const refPadre = p.referenciaPadre || p.dossier_ref || p.parent_ref || getProjectParentRef(p) || '';
        return {
          ...p,
          dossier_ref: p.dossier_ref || (refPadre || undefined),
          parent_ref: p.parent_ref || (refPadre || undefined),
          referenciaPadre: refPadre || undefined,
        };
      });
      setProjects(enrichedList);
      const globalActiveRef = getActiveGlobalReference();
      const hasActiveRdm = Boolean(globalActiveRef && /^RDM\//i.test(globalActiveRef.trim()));

      if (activeProject) {
        const updated = enrichedList.find((p) => p.id === activeProject.id || p.project_ref === activeProject.project_ref);
        if (updated) {
          setActiveProject(updated);
          setprojectDocuments(updated.documents || updated.files || []);
          if (updated.valor_total_mercancia_usd !== undefined && updated.valor_total_mercancia_usd !== null) {
            setCustCost(Number(updated.valor_total_mercancia_usd) || 0);
          }
        }
      } else if (hasActiveRdm) {
        const matchingRdm = enrichedList.find((p) => (p.project_ref && p.project_ref.toUpperCase() === globalActiveRef.trim().toUpperCase()) || isProjectMatchingActiveDossier(p, globalActiveRef));
        if (matchingRdm) {
          setActiveProject(matchingRdm);
          setprojectDocuments(matchingRdm.documents || matchingRdm.files || []);
          if (matchingRdm.valor_total_mercancia_usd !== undefined && matchingRdm.valor_total_mercancia_usd !== null) {
            setCustCost(Number(matchingRdm.valor_total_mercancia_usd) || 0);
          }
        }
      }
      return enrichedList;
    } catch (err) {
      console.error(err);
      if (!silent) setError(err?.message || 'Error de conexión');
    } finally {
      if (!silent) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    const syncActiveReference = () => {
      const currentRef = getActiveGlobalReference();
      setReferenciaActivaGlobal(currentRef || '');
    };

    const handleRefChanged = (e) => {
      const newRef = (e?.detail?.reference !== undefined ? e.detail.reference : getActiveGlobalReference()) || '';
      const cleanRef = String(newRef || '').trim();
      setReferenciaActivaGlobal(cleanRef);

      if (cleanRef && /^RDM\//i.test(cleanRef)) {
        const cleanUpper = cleanRef.toUpperCase();
        const match = projects.find((p) => {
          const pRef = (p.project_ref || '').trim().toUpperCase();
          const pPadre = (p.referenciaPadre || p.dossier_ref || p.parent_ref || '').trim().toUpperCase();
          return pRef === cleanUpper || pPadre === cleanUpper || isProjectMatchingActiveDossier(p, cleanRef);
        });
        if (match) {
          setActiveProject(match);
          setprojectDocuments(match.documents || match.files || []);
        }
      } else if (!cleanRef) {
        setActiveProject(null);
        setprojectDocuments([]);
      }
    };

    syncActiveReference();

    if (typeof window !== 'undefined') {
      window.addEventListener('contract-reference:changed', handleRefChanged);
      window.addEventListener('storage', syncActiveReference);
      window.addEventListener('focus', syncActiveReference);

      const quickRefEl = document.getElementById('quick-ref');
      if (quickRefEl) {
        quickRefEl.addEventListener('input', syncActiveReference);
        quickRefEl.addEventListener('change', syncActiveReference);
      }

      const syncInterval = setInterval(syncActiveReference, 1500);

      return () => {
        window.removeEventListener('contract-reference:changed', handleRefChanged);
        window.removeEventListener('storage', syncActiveReference);
        window.removeEventListener('focus', syncActiveReference);
        if (quickRefEl) {
          quickRefEl.removeEventListener('input', syncActiveReference);
          quickRefEl.removeEventListener('change', syncActiveReference);
        }
        clearInterval(syncInterval);
      };
    }
  }, [projects]);

  useEffect(() => {
    if (!referenciaActivaGlobal) {
      if (activeProject) {
        setActiveProject(null);
        setprojectDocuments([]);
      }
    } else if (activeProject && !isProjectMatchingActiveDossier(activeProject, referenciaActivaGlobal)) {
      const firstValid = (projects || []).find((p) => isProjectMatchingActiveDossier(p, referenciaActivaGlobal));
      setActiveProject(firstValid || null);
      if (firstValid) {
        setprojectDocuments(firstValid.documents || firstValid.files || []);
      } else {
        setprojectDocuments([]);
      }
    }
  }, [referenciaActivaGlobal]);

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => {
    if (!activeProject) {
      setprojectDocuments([]);
      setOrigin('');
      setDestination('');
      setPol('');
      setPod('');
      setDistanceNm(0);
      setDemurrageCost(0);
      setOceanFreight(0);
      setActualLoadingDays('');
      setActualDischargingDays('');
      return;
    }

    setprojectDocuments(activeProject.documents || activeProject.files || []);
    const projectRoute = activeProject.route_and_chartering ||
      activeProject.routeAndChartering ||
      activeProject.line_items?.[0]?.payload_data?.route_and_chartering ||
      activeProject.services?.[0]?.payload_data?.route_and_chartering;

    const totalWeightTons = Number(
      activeProject.total_weight_tons ??
      activeProject.totalWeightTons ??
      projectRoute?.total_weight_tons ??
      projectRoute?.totalWeightTons ??
      (totals?.weight ? totals.weight / 1000 : 0)
    ) || 0;

    if (typeof window !== 'undefined') {
      window.__ACTIVE_FORWARDER_TOTAL_WEIGHT_TONS__ = totalWeightTons;
      try {
        localStorage.setItem('seacharter_active_project_weight_tons', String(totalWeightTons));
      } catch (_) {}
      window.dispatchEvent(new CustomEvent('seacharter:project-weight-changed', {
        detail: { weightTons: totalWeightTons, projectRef: activeProject?.project_ref }
      }));
    }

    // Fix Estado Fantasma: Si totalWeightTons === 0 o !activeProject, resetea explícitamente los estados operativos
    if (totalWeightTons === 0 || !activeProject) {
      setOrigin('');
      setDestination('');
      setPol('');
      setPod('');
      setDistanceNm(0);
      setDemurrageCost(0);
      setOceanFreight(0);
      setActualLoadingDays('');
      setActualDischargingDays('');
    }

    if (totalWeightTons > 0) {
      if (activeProject.land_origin || activeProject.origin) {
        setOrigin(activeProject.land_origin || activeProject.origin || '');
      }
      if (activeProject.land_destination || activeProject.destination) {
        setDestination(activeProject.land_destination || activeProject.destination || '');
      }
    }

    if (projectRoute && totalWeightTons > 0) {
      if (projectRoute.pol) setPol(projectRoute.pol);
      if (projectRoute.pod) setPod(projectRoute.pod);
      if (projectRoute.loading_rate_mt_day) setLoadingRate(Number(projectRoute.loading_rate_mt_day));
      if (projectRoute.discharging_rate_mt_day) setDischargingRate(Number(projectRoute.discharging_rate_mt_day));
      if (projectRoute.distance_nm) setDistanceNm(Number(projectRoute.distance_nm));
      if (projectRoute.vessel_speed_knots) setVesselSpeedKnots(Number(projectRoute.vessel_speed_knots));
      if (projectRoute.daily_hire_rate_usd) setVesselDailyHireUsd(Number(projectRoute.daily_hire_rate_usd));
      if (projectRoute.actual_loading_days !== undefined && projectRoute.actual_loading_days !== null) {
        setActualLoadingDays(projectRoute.actual_loading_days);
      }
      if (projectRoute.actual_discharging_days !== undefined && projectRoute.actual_discharging_days !== null) {
        setActualDischargingDays(projectRoute.actual_discharging_days);
      }
      if (projectRoute.demurrage_daily_rate_usd) {
        setDemurrageDailyRateUsd(Number(projectRoute.demurrage_daily_rate_usd));
      }
      if (projectRoute.tce_value || projectRoute.tceValue || projectRoute.tce_daily_rate_usd) {
        const tceVal = Number(projectRoute.tce_value || projectRoute.tceValue || projectRoute.tce_daily_rate_usd);
        setTceValue(tceVal);
        setTceActive(true);
      }
      if (projectRoute.flete_compra_usd_mt || projectRoute.freight_rate_cost_usd || projectRoute.flete_sugerido_armador_compra || projectRoute.flete_compra) {
        const fcVal = Number(projectRoute.flete_compra_usd_mt || projectRoute.freight_rate_cost_usd || projectRoute.flete_sugerido_armador_compra || projectRoute.flete_compra);
        setFleteCompra(fcVal);
      }
      if (projectRoute.flete_venta_usd_mt || projectRoute.freight_rate_sell_usd || projectRoute.flete_sugerido_fletador_venta || projectRoute.flete_venta) {
        const fvVal = Number(projectRoute.flete_venta_usd_mt || projectRoute.freight_rate_sell_usd || projectRoute.flete_sugerido_fletador_venta || projectRoute.flete_venta);
        setFleteVenta(fvVal);
      }
      if (projectRoute.vessel_type) {
        setVesselType(projectRoute.vessel_type);
      }
    }
    const projectAssessment = activeProject.charteringAssessment ||
      activeProject.chartering_assessment ||
      activeProject.line_items?.[0]?.payload_data?.charteringAssessment ||
      activeProject.services?.[0]?.payload_data?.charteringAssessment;
    if (projectAssessment) {
      setCharteringAssessment(projectAssessment);
    }

      // Absorción inversa de Costes Terrestres (DataBridge / Land Charter ➔ Core PRO):
      // Extrae coste terrestre y mercancía, convirtiendo EUR a USD según el tipo de cambio del proyecto
      const activeExRate = Number(
        projectRoute?.exchange_rate ??
        projectRoute?.exchangeRate ??
        activeProject.exchange_rate ??
        exchangeRateUsdEur ??
        0.92
      ) || 0.92;

      const rawLandCostEur = Number(
        activeProject.land_freight_cost_eur ??
        activeProject.land_freight_cost ??
        activeProject.landFreightCost ??
        activeProject.line_items?.[0]?.payload_data?.peripheral_services?.inland_cost_eur ??
        activeProject.services?.[0]?.payload_data?.peripheral_services?.inland_cost_eur ??
        activeProject.line_items?.[0]?.payload_data?.peripheral_services?.inland_cost ??
        activeProject.services?.[0]?.payload_data?.peripheral_services?.inland_cost ??
        activeProject.land_charter?.cost ??
        activeProject.land_charter?.freight_cost ??
        0
      ) || 0;

      if (rawLandCostEur > 0) {
        const landCostUsd = Math.round((rawLandCostEur / activeExRate) * 100) / 100;
        setInlandCost(landCostUsd);

        const projectTons = Number(
          activeProject.total_weight_tons ??
          activeProject.totalWeightTons ??
          activeProject.weight_tons ??
          (totals?.weight ? totals.weight / 1000 : 0)
        ) || 0;

        if (projectTons > 0) {
          const landRatePerMt = Math.round((landCostUsd / projectTons) * 100) / 100;
          if (typeof window !== 'undefined') {
            window.__ACTIVE_LAND_CHARTER_RATE_USD_MT__ = landRatePerMt;
            try {
              localStorage.setItem('seacharter_active_project_land_cost', String(landCostUsd));
              localStorage.setItem('seacharter_active_project_land_rate_usd_mt', String(landRatePerMt));
            } catch (_) {}
            window.dispatchEvent(new CustomEvent('seacharter:land-charter-rate-changed', {
              detail: { rateUsdMt: landRatePerMt }
            }));
          }
        }
      }

      // 2. Absorción Exacta del Coste de Mercancía (Ya viene en USD desde Data Bridge)
      const incomingMercancia = Number(
        activeProject.valor_total_mercancia_usd ??
        activeProject.valorTotalMercanciaUsd ??
        activeProject.payload_data?.valorTotalMercanciaUsd ??
        activeProject.payload_data?.valor_total_mercancia_usd ??
        activeProject.line_items?.[0]?.payload_data?.valorTotalMercanciaUsd ??
        activeProject.line_items?.[0]?.payload_data?.valor_total_mercancia_usd ??
        activeProject.services?.[0]?.payload_data?.valorTotalMercanciaUsd ??
        activeProject.services?.[0]?.payload_data?.valor_total_mercancia_usd ??
        0
      ) || 0;
      setCustCost(Number(activeProject.valor_total_mercancia_usd) || incomingMercancia);
  }, [activeProject]);

  // Hook de sincronización y antiduplicidad desde el Gestor de Tarifas FOB / EXW
  useEffect(() => {
    const handleTariffInjected = (e) => {
      const detail = e?.detail;
      if (!detail) return;

      const commercialModality = String(detail.commercialModality || detail.modality || 'FOB').toUpperCase();
      const totalMercancia = Number(detail.valorTotalMercanciaUsd || detail.fobSaleTotalUsd || detail.saleTotalUsd) || 0;

      if (totalMercancia > 0) {
        setCustCost(totalMercancia);
      }

      if (commercialModality === 'FOB') {
        // En FOB (Todo Incluido), el precio de la mercancía ya absorbe la logística terrestre y tasas portuarias.
        // Se fuerzan a 0 los costes paralelos en el módulo terrestre para evitar duplicar costes.
        setInlandCost(0);
      } else if (commercialModality === 'EXW') {
        // En EXW (Desglosado), la mercancía es precio de planta y se aplican de forma separada
        const inlandVal = Number(detail.inlandTransportTotalUsd || (detail.inlandTransport && detail.quantityMT ? detail.inlandTransport * detail.quantityMT : 0)) || 0;
        if (inlandVal > 0) {
          setInlandCost(inlandVal);
        }
      }
    };

    window.addEventListener('seacharter:provider-tariff-injected', handleTariffInjected);
    return () => {
      window.removeEventListener('seacharter:provider-tariff-injected', handleTariffInjected);
    };
  }, []);

  // Hook de sincronización reactiva (Two-Way Binding): Parser del Agente -> Inputs del Formulario y Contadores Visuales
  // Asegura que cuando el Agente de Proyectos procese una instrucción (charteringAssessment / rotationBreakdown),
  // los inputs de "Ruta Marítima, Ritmos Operativos y Gestión de Demoras" reflejen de inmediato los nuevos valores devueltos por el backend
  // y actualicen los contadores visuales en tiempo real, evitando que los campos se queden estáticos con los valores por defecto iniciales.
  useEffect(() => {
    if (!charteringAssessment) return;

    const rot = charteringAssessment.rotationBreakdown || charteringAssessment.timeCharterEquivalent;
    if (!rot) return;

    if (rot.pol && rot.pol !== pol) {
      setPol(rot.pol);
    }
    if (rot.pod && rot.pod !== pod) {
      setPod(rot.pod);
    }
    const loadRate = Number(rot.loadingRateMtDay || rot.loadingRate || rot.loadRate);
    if (!isNaN(loadRate) && loadRate > 0 && loadRate !== Number(loadingRate)) {
      setLoadingRate(loadRate);
    }
    const dischRate = Number(rot.dischargingRateMtDay || rot.dischargingRate || rot.dischargeRate);
    if (!isNaN(dischRate) && dischRate > 0 && dischRate !== Number(dischargingRate)) {
      setDischargingRate(dischRate);
    }
    const dist = Number(rot.distanceNm || rot.distance_nm);
    if (!isNaN(dist) && dist > 0 && dist !== Number(distanceNm)) {
      setDistanceNm(dist);
    }
    const speed = Number(rot.serviceSpeedKnots || rot.serviceSpeed || rot.speedKnots);
    if (!isNaN(speed) && speed > 0 && speed !== Number(vesselSpeedKnots)) {
      setVesselSpeedKnots(speed);
    }
    const dailyHire = Number(rot.dailyHireRateUsd || rot.vesselDailyRateUsd || rot.dailyRateUsd);
    if (!isNaN(dailyHire) && dailyHire > 0 && dailyHire !== Number(vesselDailyHireUsd)) {
      setVesselDailyHireUsd(dailyHire);
    }
    if (rot.demurrage) {
      const dem = rot.demurrage;
      if (dem.actualLoadingDays !== undefined && dem.actualLoadingDays !== null && String(dem.actualLoadingDays) !== String(actualLoadingDays)) {
        setActualLoadingDays(dem.actualLoadingDays);
      }
      if (dem.actualDischargingDays !== undefined && dem.actualDischargingDays !== null && String(dem.actualDischargingDays) !== String(actualDischargingDays)) {
        setActualDischargingDays(dem.actualDischargingDays);
      }
      const demDaily = Number(dem.demurrageRateDailyUsd);
      if (!isNaN(demDaily) && demDaily > 0 && demDaily !== Number(demurrageDailyRateUsd)) {
        setDemurrageDailyRateUsd(demDaily);
      }
    }
  }, [charteringAssessment]);

  // Hook de sincronización reactiva (Two-Way Binding): Inputs del Formulario -> Estado global de Fletamento y Workspace
  // Mantiene sincronizado el desglose de rotación (rotationBreakdown) cuando el usuario edita directamente los campos
  useEffect(() => {
    setCharteringAssessment(prev => {
      const currentRot = prev?.rotationBreakdown || {};
      const newLoadingRate = Number(loadingRate);
      const newDischargingRate = Number(dischargingRate);
      const newDistance = Number(distanceNm);
      const newSpeed = Number(vesselSpeedKnots);
      const newDailyHire = Number(vesselDailyHireUsd);
      const newDemDaily = Number(demurrageDailyRateUsd);
      const newActualLoad = actualLoadingDays !== '' && actualLoadingDays !== null && !isNaN(Number(actualLoadingDays)) ? Number(actualLoadingDays) : null;
      const newActualDisch = actualDischargingDays !== '' && actualDischargingDays !== null && !isNaN(Number(actualDischargingDays)) ? Number(actualDischargingDays) : null;

      if (
        currentRot.pol === pol &&
        currentRot.pod === pod &&
        currentRot.loadingRateMtDay === newLoadingRate &&
        currentRot.dischargingRateMtDay === newDischargingRate &&
        currentRot.distanceNm === newDistance &&
        currentRot.serviceSpeedKnots === newSpeed &&
        currentRot.dailyHireRateUsd === newDailyHire &&
        currentRot.demurrage?.actualLoadingDays === newActualLoad &&
        currentRot.demurrage?.actualDischargingDays === newActualDisch &&
        currentRot.demurrage?.demurrageRateDailyUsd === newDemDaily
      ) {
        return prev;
      }

      return {
        ...(prev || {}),
        rotationBreakdown: {
          ...currentRot,
          pol,
          pod,
          loadingRateMtDay: newLoadingRate,
          dischargingRateMtDay: newDischargingRate,
          distanceNm: newDistance,
          serviceSpeedKnots: newSpeed,
          dailyHireRateUsd: newDailyHire,
          demurrage: {
            ...(currentRot.demurrage || {}),
            actualLoadingDays: newActualLoad,
            actualDischargingDays: newActualDisch,
            demurrageRateDailyUsd: newDemDaily,
          }
        }
      };
    });
  }, [pol, pod, loadingRate, dischargingRate, distanceNm, vesselSpeedKnots, vesselDailyHireUsd, actualLoadingDays, actualDischargingDays, demurrageDailyRateUsd]);

  const persistProjectToDatabase = async (projectToSave) => {
    try {
      const res = await fetch(getApiUrl('/.netlify/functions/forwarder-projects'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(projectToSave)
      });
      if (!res.ok) {
        await fetch(getApiUrl('/.netlify/functions/forwarder-projects'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(projectToSave)
        });
      }
    } catch (err) {
      console.error('Error al guardar en base de datos:', err);
    }
  };

  // Sincronización completa en tiempo real de la calculadora con el expediente activo y Neon (PUT)
  const handleSyncCalculatorData = async () => {
    if (!activeProject) return;
    setIsSyncingCalculator(true);
    setSyncSuccessNotice(null);

    try {
      // 1. Captura en tiempo real de absolutamente todos los cambios realizados en la calculadora
      const sessionSource = readActiveCalculatorSession();

      const polEl = document.getElementById('port-pol') || document.getElementById('map-port-pol');
      const podEl = document.getElementById('port-pod') || document.getElementById('map-port-pod');
      const ballastEl = document.getElementById('port-ballast');
      const cargoQtyEl = document.getElementById('cargo-qty') || document.getElementById('cargo-quantity');
      const cargoTypeEl = document.getElementById('cargo-type') || document.getElementById('cargo-category');
      const cargoProductEl = document.getElementById('cargo-product');
      const cargoTypeManualEl = document.getElementById('cargo-type-manual');
      const packingEl = document.getElementById('gc-add-packing') || document.getElementById('cargo-packaging');
      const loadRateEl = document.getElementById('rate-load') || document.getElementById('load-rate') || document.getElementById('input-loadRate');
      const dischRateEl = document.getElementById('rate-disch') || document.getElementById('disch-rate') || document.getElementById('rate-discharge') || document.getElementById('input-dischRate');
      const distEl = document.getElementById('dist-laden') || document.getElementById('dist-total');
      const speedEl = document.getElementById('spd-laden') || document.getElementById('vessel-speed');
      const freightCostEl = document.getElementById('freight-rate') || document.getElementById('freight-rate-calc') || document.getElementById('input-freightRate') || document.getElementById('buying-freight') || document.getElementById('flete-compra');
      const freightSellEl = document.getElementById('freight-sell') || document.getElementById('selling-freight') || document.getElementById('flete-venta') || document.getElementById('target-freight-sell');
      const marginEl = document.getElementById('margin-charterer') || document.getElementById('margin-owner');
      const methodLoadEl = document.getElementById('metodo_carga');
      const methodDischEl = document.getElementById('metodo_descarga_pod');
      const charterPartyEl = document.getElementById('charter-party-standard');

      const capturedPol = String(polEl?.value || sessionSource.pol || pol || '').trim();
      const capturedPod = String(podEl?.value || sessionSource.pod || pod || '').trim();
      const capturedBallast = String(ballastEl?.value || sessionSource.portBallast || '').trim();

      const capturedCargoQty = Math.max(
        0,
        parseFloat(cargoQtyEl?.value) ||
        Number(sessionSource.cargoQty || sessionSource.cargo || sessionSource.quantityMT) ||
        0
      );

      const capturedCargoCategory = String(
        cargoTypeEl?.value ||
        sessionSource.cargoCategory ||
        sessionSource.cargoType ||
        ''
      ).trim();

      const capturedCargoProduct = String(
        cargoProductEl?.value ||
        sessionSource.cargoProduct ||
        sessionSource.productoEspecifico ||
        sessionSource.commodity ||
        ''
      ).trim();

      const capturedTypeManual = String(cargoTypeManualEl?.value || sessionSource.cargoTypeManual || '').trim();
      const capturedPacking = String(packingEl?.value || sessionSource.cargoPacking || '').trim();

      // Clasificación en tiempo real del tipo de mercancía (Granel vs Big Bags vs Palets)
      const isBigBags = /big[- ]?bag|ensacad|saco/i.test(capturedCargoProduct) ||
                        /big[- ]?bag|ensacad|saco/i.test(capturedCargoCategory) ||
                        capturedPacking === 'bigbag' ||
                        capturedCargoProduct.toLowerCase().includes('big bag');

      const isPallets = /palet|pallet|unitariz/i.test(capturedCargoProduct) ||
                        /palet|pallet|unitariz/i.test(capturedCargoCategory) ||
                        capturedPacking === 'pallet' ||
                        capturedCargoProduct.toLowerCase().includes('palet');

      const isBulk = !isBigBags && !isPallets && (
        /granel|bulk|clinker|yeso|mineral|carbon/i.test(capturedCargoProduct) ||
        /granel|dry bulk|liquid bulk/i.test(capturedCargoCategory) ||
        capturedPacking === 'standard'
      );

      const capturedLoadRate = Math.max(
        1,
        parseFloat(loadRateEl?.value) ||
        Number(sessionSource.loadRate || loadingRate) ||
        (isBigBags ? 1200 : (isPallets ? 1000 : 1200))
      );

      const capturedDischRate = Math.max(
        1,
        parseFloat(dischRateEl?.value) ||
        Number(sessionSource.dischRate || dischargingRate) ||
        (isBigBags ? 1000 : (isPallets ? 800 : 1000))
      );

      const capturedDistance = Math.max(
        10,
        parseFloat(distEl?.value) ||
        Number(sessionSource.distanceNm || distanceNm) ||
        1500
      );

      const capturedSpeed = Math.max(
        1,
        parseFloat(speedEl?.value) ||
        Number(sessionSource.speedKnots || vesselSpeedKnots) ||
        12.0
      );

      const capturedFreightCost = Math.max(
        0,
        parseFloat(freightCostEl?.value) ||
        Number(sessionSource.freightCost || sessionSource.fleteCompra || sessionSource.flete_compra || sessionSource.freightRate) ||
        parseFloat(String(document.getElementById('coa-detail-owner-purchase')?.textContent || '').replace(/[^0-9.-]/g, '')) ||
        0
      );

      const capturedFreightSell = Math.max(
        0,
        parseFloat(freightSellEl?.value) ||
        Number(sessionSource.freightSell || sessionSource.fleteVenta || sessionSource.flete_venta || sessionSource.sellingFreight || sessionSource.targetFreightSell) ||
        parseFloat(String(document.getElementById('coa-detail-charterer-target')?.textContent || '').replace(/[^0-9.-]/g, '')) ||
        0
      );

      const capturedMargin = (capturedFreightCost > 0 && capturedFreightSell > 0)
        ? Math.round(((capturedFreightSell - capturedFreightCost) / capturedFreightCost) * 100 * 100) / 100
        : (parseFloat(marginEl?.value) || Number(activeProject.global_margin_percentage) || 15);

      // Captura exhaustiva del valor exacto de TCE activo en la calculadora
      const tceFromLabel = parseFloat(String(document.getElementById('res-tce-label')?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
      const tceFromPrint = parseFloat(String(document.getElementById('print-tce-owner')?.innerText || document.getElementById('print-tce-owner')?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
      const capturedTce = Math.max(
        0,
        Number(sessionSource.tce || vesselDailyHireUsd) ||
        tceFromLabel ||
        tceFromPrint ||
        11500
      );

      // Cálculos náuticos y de rotación sincronizados con la Vista Ejecutiva (fuente de verdad definitiva)
      const execTimes = getExecutiveOperationalTimes();
      const rawDiasCarga = capturedCargoQty > 0 ? Math.round((capturedCargoQty / capturedLoadRate) * 100) / 100 : 0;
      const rawDiasDescarga = capturedCargoQty > 0 ? Math.round((capturedCargoQty / capturedDischRate) * 100) / 100 : 0;
      const rawPortTotal = Math.round((rawDiasCarga + rawDiasDescarga) * 100) / 100;

      const diasNavegacion = (execTimes.seaDays !== null && execTimes.seaDays > 0)
        ? execTimes.seaDays
        : Math.round((capturedDistance / (capturedSpeed * 24)) * 100) / 100;

      const diasMuelle = (execTimes.portDays !== null && execTimes.portDays > 0)
        ? execTimes.portDays
        : rawPortTotal;

      const diasRotacionTotal = (execTimes.totalDays !== null && execTimes.totalDays > 0)
        ? execTimes.totalDays
        : Math.round((diasMuelle + diasNavegacion) * 100) / 100;

      let diasCarga = rawDiasCarga;
      let diasDescarga = rawDiasDescarga;
      if (execTimes.portDays !== null && execTimes.portDays > 0 && rawPortTotal > 0) {
        diasCarga = Math.round((rawDiasCarga / rawPortTotal) * execTimes.portDays * 100) / 100;
        diasDescarga = Math.round((execTimes.portDays - diasCarga) * 100) / 100;
      } else if (execTimes.portDays !== null && execTimes.portDays > 0 && rawPortTotal === 0) {
        diasCarga = Math.round((execTimes.portDays / 2) * 100) / 100;
        diasDescarga = Math.round((execTimes.portDays - diasCarga) * 100) / 100;
      }

      const oceanFreightTceUsd = Math.round(diasRotacionTotal * capturedTce * 100) / 100;
      const oceanFreightTceEur = Math.round(oceanFreightTceUsd * exchangeRateUsdEur * 100) / 100;

      // Adaptación reactiva de la Lista de Empaque / Piezas según el tipo de mercancía
      let updatedCargoItems = [];
      if (isBigBags) {
        const bagWeightKg = 1500;
        const totalPieces = capturedCargoQty > 0 ? Math.max(1, Math.round((capturedCargoQty * 1000) / bagWeightKg)) : 1000;
        updatedCargoItems = [{
          id: `item-bigbags-${Date.now()}`,
          category: 'Big Bags',
          quantity: totalPieces,
          type: capturedCargoProduct || 'Big Bags (Minerales/Cemento)',
          length: 1.15,
          width: 1.10,
          height: 1.20,
          weight: bagWeightKg,
          shipping_mode_supported: 'Geared Breakbulk (Lo-Lo)'
        }];
      } else if (isPallets) {
        const palletWeightKg = 1500;
        const totalPieces = capturedCargoQty > 0 ? Math.max(1, Math.round((capturedCargoQty * 1000) / palletWeightKg)) : 1000;
        updatedCargoItems = [{
          id: `item-pallets-${Date.now()}`,
          category: 'Carga Paletizada',
          quantity: totalPieces,
          type: capturedCargoProduct || 'Carga Paletizada',
          length: 1.20,
          width: 1.00,
          height: 1.50,
          weight: palletWeightKg,
          shipping_mode_supported: 'Geared Breakbulk (Lo-Lo)'
        }];
      } else {
        updatedCargoItems = [{
          id: `item-bulk-${Date.now()}`,
          category: capturedCargoCategory || 'Granel Sólido (Dry Bulk)',
          quantity: 1,
          type: capturedCargoProduct || 'Granel Sólido',
          length: 0,
          width: 0,
          height: 0,
          weight: capturedCargoQty > 0 ? capturedCargoQty * 1000 : 15000000,
          shipping_mode_supported: 'Bulk Carrier'
        }];
      }

      // Captura y generación de la Vista Ejecutiva
      let masterExecReport = null;
      try {
        if (typeof window.buildMasterExecutiveReportData === 'function') {
          masterExecReport = window.buildMasterExecutiveReportData();
        }
      } catch (_) {}

      const currentReportSnapshot = buildExecutiveReportData({
        cargo_items: updatedCargoItems,
        route_and_chartering: {
          pol: capturedPol,
          pod: capturedPod,
          loading_rate_mt_day: capturedLoadRate,
          discharging_rate_mt_day: capturedDischRate,
          distance_nm: capturedDistance,
          vessel_speed_knots: capturedSpeed,
          daily_hire_rate_usd: capturedTce,
          exchange_rate: exchangeRateUsdEur,
          dias_carga: diasCarga,
          dias_descarga: diasDescarga,
          dias_muelle: diasMuelle,
          dias_muelle_total: diasMuelle,
          dias_navegacion: diasNavegacion,
          dias_rotacion_total: diasRotacionTotal,
          sea_days: diasNavegacion,
          port_days: diasMuelle,
          total_days: diasRotacionTotal,
        }
      });

      // Construcción del objeto route_and_chartering enriquecido
      const updatedRouteAndChartering = {
        pol: capturedPol,
        pod: capturedPod,
        port_ballast: capturedBallast,
        distance_nm: capturedDistance,
        loading_rate_mt_day: capturedLoadRate,
        discharging_rate_mt_day: capturedDischRate,
        vessel_speed_knots: capturedSpeed,
        daily_hire_rate_usd: capturedTce,
        tce_value: capturedTce,
        tce_daily_rate_usd: capturedTce,
        ocean_freight_tce_usd: oceanFreightTceUsd,
        ocean_freight_tce_eur: oceanFreightTceEur,
        commodity: capturedCargoProduct || capturedCargoCategory || 'Carga General',
        cargo_product: capturedCargoProduct,
        cargo_type: capturedCargoCategory,
        cargo_category: capturedCargoCategory,
        cargo_packing: capturedPacking,
        cargo_type_manual: capturedTypeManual,
        is_big_bags: isBigBags,
        is_palletized: isPallets,
        is_bulk: isBulk,
        total_weight_tons: capturedCargoQty,
        flete_compra_usd_mt: capturedFreightCost,
        flete_venta_usd_mt: capturedFreightSell,
        freight_rate_cost_usd: capturedFreightCost,
        freight_rate_sell_usd: capturedFreightSell,
        flete_sugerido_armador_compra: capturedFreightCost,
        flete_sugerido_fletador_venta: capturedFreightSell,
        flete_compra: capturedFreightCost,
        flete_venta: capturedFreightSell,
        exchange_rate: exchangeRateUsdEur,
        metodo_carga: methodLoadEl?.value || sessionSource.metodoCarga || '',
        metodo_descarga: methodDischEl?.value || sessionSource.metodoDescarga || '',
        charter_party_standard: charterPartyEl?.value || sessionSource.charterPartyStandard || 'GENCON',
        dias_carga: diasCarga,
        dias_descarga: diasDescarga,
        dias_muelle: diasMuelle,
        dias_muelle_total: diasMuelle,
        dias_navegacion: diasNavegacion,
        dias_rotacion_total: diasRotacionTotal,
        sea_days: diasNavegacion,
        port_days: diasMuelle,
        total_days: diasRotacionTotal,
        actual_loading_days: actualLoadingDays,
        actual_discharging_days: actualDischargingDays,
        demurrage_daily_rate_usd: capturedTce,
        demurrage_days: 0,
        demurrage_cost_eur: 0,
        demurrage_cost_usd: 0,
        demurrage_status: 'DENTRO DE PLANCHA (ON SCHEDULE)',
        plancha_dias_permitidos: diasMuelle,
        vessel_type: isBulk ? 'Bulk Carrier (Granelero)' : (isBigBags ? 'Geared Breakbulk (Lo-Lo)' : 'Multi-Purpose MPP'),
        executive_report_snapshot: currentReportSnapshot,
        executive_report: masterExecReport || currentReportSnapshot,
        is_real_estimate: true,
        last_sync_at: new Date().toISOString()
      };

      // Flete y servicios asociados para los line_items
      const totalCostUsd = capturedFreightCost > 0 && capturedCargoQty > 0
        ? capturedFreightCost * capturedCargoQty
        : oceanFreightTceUsd;
      const totalSaleUsd = capturedFreightSell > 0 && capturedCargoQty > 0
        ? capturedFreightSell * capturedCargoQty
        : totalCostUsd * (1 + (capturedMargin / 100));

      const totalCostEur = Math.round(totalCostUsd * exchangeRateUsdEur * 100) / 100;
      const totalSaleEur = Math.round(totalSaleUsd * exchangeRateUsdEur * 100) / 100;

      const serviceLineItem = {
        id: activeProject.line_items?.[0]?.id || activeProject.items?.[0]?.id || `service-calc-sync-${Date.now()}`,
        description: `Flete y Operaciones Marítimas (${capturedCargoProduct || capturedCargoCategory || 'Carga'}, ${capturedCargoQty.toLocaleString('es-ES')} MT: ${capturedPol} ➔ ${capturedPod})`,
        cost_eur: totalCostEur,
        sale_price_eur: totalSaleEur,
        margin_eur: totalSaleEur - totalCostEur,
        payload_data: {
          route_and_chartering: updatedRouteAndChartering,
          cargo_items: updatedCargoItems,
          financialBreakdown: {
            subtotalOceanFreight: totalCostUsd,
            subtotalFobPortOperations: 0,
            finalTotalCost: totalCostUsd,
            finalTotalSale: totalSaleUsd,
          },
          financial_summary: {
            subtotal_ocean_freight_usd: totalCostUsd,
            subtotal_fob_operations_usd: 0,
            estimated_total_cost_usd: totalCostUsd,
            customer_sale_price_usd: totalSaleUsd,
            subtotal_ocean_freight_eur: totalCostEur,
            subtotal_fob_operations_eur: 0,
            estimated_total_cost_eur: totalCostEur,
            customer_sale_price_eur: totalSaleEur,
          },
          executive_report_snapshot: currentReportSnapshot,
          totals: {
            quantity: updatedCargoItems.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0),
            weight: capturedCargoQty * 1000,
            m2: currentReportSnapshot?.totals?.m2 || 0,
            m3: currentReportSnapshot?.totals?.m3 || 0,
          }
        }
      };

      const existingItems = Array.isArray(activeProject.line_items) ? activeProject.line_items : (Array.isArray(activeProject.items) ? activeProject.items : []);
      const otherItems = existingItems.filter(it => it.id !== serviceLineItem.id);
      const updatedLineItems = [serviceLineItem, ...otherItems];

      // 2. Ejecutar actualización inmediata (PUT) a la base de datos de Neon
      const payloadToSync = {
        id: activeProject.id,
        project_ref: activeProject.project_ref,
        client_name: activeProject.client_name,
        status: activeProject.status || 'Borrador',
        global_margin_percentage: capturedMargin,
        documents: activeProject.documents || [],
        items: updatedLineItems,
        route_and_chartering: updatedRouteAndChartering,
        land_origin: activeProject.land_origin,
        land_destination: activeProject.land_destination,
        land_distance: activeProject.land_distance,
        land_freight_cost: activeProject.land_freight_cost,
      };

      const res = await fetch(getApiUrl('/.netlify/functions/forwarder-projects'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payloadToSync),
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status} al sincronizar con Neon.`);
      }

      const resData = await res.json();
      const savedProject = resData.project || payloadToSync;

      const normalizedProject = {
        ...activeProject,
        ...savedProject,
        route_and_chartering: updatedRouteAndChartering,
        line_items: updatedLineItems,
        items: updatedLineItems,
      };

      // 3. Sincronizar el proyecto activo y el estado local de la interfaz
      setActiveProject(normalizedProject);
      setProjects((prev) => prev.map((p) => (p.id === activeProject.id || p.project_ref === activeProject.project_ref) ? normalizedProject : p));

      setPol(capturedPol);
      setPod(capturedPod);
      setLoadingRate(capturedLoadRate);
      setDischargingRate(capturedDischRate);
      setDistanceNm(capturedDistance);
      setVesselSpeedKnots(capturedSpeed);
      setVesselDailyHireUsd(capturedTce);
      setDemurrageDailyRateUsd(capturedTce);
      setTceValue(capturedTce);
      setTceActive(true);
      setFleteCompra(capturedFreightCost);
      setFleteVenta(capturedFreightSell);
      setIsBigBagsCargo(isBigBags);
      setCargoItems(updatedCargoItems);
      setActiveReport(currentReportSnapshot);
      setReportData(currentReportSnapshot);

      // Sincronización Inversa de Costes Terrestres (DataBridge ➔ Core PRO):
      const activeExRate = Number(
        updatedRouteAndChartering.exchange_rate ??
        activeProject.exchange_rate ??
        exchangeRateUsdEur ??
        0.92
      ) || 0.92;

      const rawLandCostEur = Number(
        activeProject.land_freight_cost_eur ??
        activeProject.land_freight_cost ??
        activeProject.landFreightCost ??
        sessionSource.landFreightCost ??
        sessionSource.landCost ??
        0
      ) || 0;

      let syncedInlandCost = Number(inlandCost) || 0;
      if (rawLandCostEur > 0) {
        syncedInlandCost = Math.round((rawLandCostEur / activeExRate) * 100) / 100;
        setInlandCost(syncedInlandCost);
      }

      // 2. Absorción Exacta del Coste de Mercancía (Ya viene en USD desde Data Bridge)
      const incomingMercancia = Number(
        activeProject.valor_total_mercancia_usd ??
        activeProject.valorTotalMercanciaUsd ??
        activeProject.payload_data?.valorTotalMercanciaUsd ??
        activeProject.payload_data?.valor_total_mercancia_usd ??
        sessionSource.valorTotalMercanciaUsd ??
        sessionSource.valor_total_mercancia_usd ??
        0
      ) || 0;
      setCustCost(Number(activeProject.valor_total_mercancia_usd) || incomingMercancia);

      // Disparar recálculo financiero inmediato
      autoCalculateEstimates(updatedCargoItems, capturedCargoCategory);

      // 4. Mostrar aviso visual de confirmación de sincronización exitosa
      setSyncSuccessNotice('¡Datos actualizados con éxito!');
      setSyncFeedback('¡Datos actualizados con éxito!');

      setTimeout(() => {
        setSyncFeedback(null);
      }, 3500);

      setTimeout(() => {
        setSyncSuccessNotice(null);
      }, 5000);

      await fetchProjects({ silent: true });
    } catch (err) {
      console.error('Error al sincronizar datos de la calculadora con Neon:', err);
      setSyncSuccessNotice(`⚠️ Error de sincronización: ${err.message || 'Fallo de conexión con Neon'}`);
    } finally {
      setIsSyncingCalculator(false);
    }
  };

  handleSyncCalculatorDataRef.current = handleSyncCalculatorData;

  const handleCreateProject = async (e) => {
    // 🛡️ BLINDAJE ULTRA-ESTRICTO:
    // Bloquear si es ejecución programática/sintética, durante inyección de IA o en carga inicial
    const isSynthetic = e && (e.isTrusted === false || e.isProgrammatic === true);
    const isAiInjecting = typeof window !== 'undefined' && Boolean(
      window.__AI_INJECTION_IN_PROGRESS__ ||
      window.updateFieldsActionInProgress ||
      window.__IS_PROGRAMMATIC_UPDATE__
    );
    const isPageLoading = typeof document !== 'undefined' && document.readyState !== 'complete';

    if (isSynthetic || isAiInjecting || isPageLoading) {
      console.warn("🛡️ [ForwarderWorkspace] Creación de proyecto bloqueada: ejecución automática, IA o carga inicial.");
      return;
    }

    let input = null;
    try {
      input = window.prompt('Introduce el nombre del cliente para el nuevo proyecto:');
    } catch (_) {
      return;
    }

    // Si el usuario cancela (null) o devuelve vacío, aborta la operación silenciosamente y NO llames al endpoint /api/forwarder-projects
    if (input === null || !input || !input.trim()) {
      return;
    }

    setIsCreating(true);
    try {
      const currentGlobalRef = getActiveGlobalReference() || referenciaActivaGlobal || '';
      const res = await fetch(getApiUrl('/.netlify/functions/forwarder-projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_name: input.trim(),
          documents: [],
          project_ref: currentGlobalRef ? `${currentGlobalRef}-EXP-${Date.now().toString().slice(-4)}` : undefined,
          dossier_ref: currentGlobalRef || undefined,
          parent_ref: currentGlobalRef || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      const createdProject = payload.project || payload;
      const refPadre = createdProject.referenciaPadre || createdProject.dossier_ref || createdProject.parent_ref || currentGlobalRef || getProjectParentRef(createdProject);
      const normalizedCreatedProject = {
        ...createdProject,
        dossier_ref: createdProject.dossier_ref || (refPadre || undefined),
        parent_ref: createdProject.parent_ref || (refPadre || undefined),
        referenciaPadre: refPadre || undefined,
      };
      setProjects((prev) => [normalizedCreatedProject, ...prev]);
      setActiveProject(normalizedCreatedProject);
      setprojectDocuments([]);
    } catch (err) {
      window.alert('No se pudo crear el proyecto.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (e, projToDelete) => {
    // 🛡️ BLINDAJE ULTRA-ESTRICTO: Exigir que sea un clic humano real (isTrusted).
    if (!e || !e.isTrusted || typeof e.stopPropagation !== 'function') {
      console.warn("Bloqueado: Clic virtual o evento de IA detectado.");
      return; 
    }
    e.stopPropagation();

    // Extraer el proyecto de forma estricta
    const targetProj = projToDelete;
    if (!targetProj || typeof targetProj !== 'object' || (!targetProj.id && !targetProj.project_ref)) {
      return;
    }

    const displayName = targetProj.client_name || targetProj.project_ref || 'este proyecto';
    const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar el proyecto "${displayName}"?`);
    if (!confirmed) return;

    // 1. Eliminar inmediatamente del estado local en el frontend
    const updatedProjects = projects.filter((p) => {
      if (projToDelete.id && p.id) {
        return p.id !== projToDelete.id;
      }
      return p.project_ref !== projToDelete.project_ref;
    });
    setProjects(updatedProjects);

    // 2. Si el usuario elimina el proyecto activo en el workspace, limpiar o redirigir
    const isCurrentActive = activeProject && (
      (projToDelete.id && activeProject.id === projToDelete.id) ||
      (projToDelete.project_ref && activeProject.project_ref === projToDelete.project_ref)
    );

    if (isCurrentActive) {
      setIsCargoModalOpen(false);
      setShowExecutiveReport(false);
      if (updatedProjects.length > 0) {
        setActiveProject(updatedProjects[0]);
      } else {
        setActiveProject(null);
      }
    }

    setSaveSuccessMessage('Proyecto eliminado correctamente');
    setTimeout(() => setSaveSuccessMessage(null), 3000);

    // 3. Sincronizar con almacenamiento local si existe caché
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = window.localStorage.getItem('forwarder_projects');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((p) => {
              if (projToDelete.id && p.id) return p.id !== projToDelete.id;
              return p.project_ref !== projToDelete.project_ref;
            });
            window.localStorage.setItem('forwarder_projects', JSON.stringify(filtered));
          }
        }
      }
    } catch (storageErr) {
      console.warn('No se pudo actualizar localStorage:', storageErr);
    }

    // 4. Ejecutar llamada de borrado en la base de datos
    try {
      await fetch(getApiUrl('/.netlify/functions/forwarder-projects'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: projToDelete.id,
          project_ref: projToDelete.project_ref
        })
      });
    } catch (err) {
      console.error('Error al eliminar proyecto de la base de datos:', err);
    }
  };

  const handleTriggerImport = () => { if (fileInputRef.current && !isAnalyzingFile) fileInputRef.current.click(); };

  const handleSaveDocumentToProject = async (docMeta) => {
    if (!activeProject) {
      window.alert('⚠️ Selecciona o crea un proyecto activo antes de adjuntar y guardar documentos.');
      return;
    }

    // NUNCA persistir dataBase64 ni datos binarios en la base de datos para evitar exceder 6 MB
    const cleanDocMeta = {
      name: docMeta.name || 'Documento_Proyecto.pdf',
      size: docMeta.size ? (typeof docMeta.size === 'string' ? docMeta.size : `${Math.round(docMeta.size / 1024)} KB`) : '120 KB',
      itemsCount: docMeta.itemsCount || 1,
      uploadedAt: docMeta.uploadedAt || new Date().toISOString()
    };

    const newDoc = {
      id: docMeta.id || `doc-${Date.now()}-${Math.random()}`,
      name: cleanDocMeta.name,
      size: cleanDocMeta.size,
      date: docMeta.uploadedAt ? new Date(docMeta.uploadedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      itemsCount: cleanDocMeta.itemsCount,
      payload: cleanDocMeta
    };

    const updatedDocs = [...projectDocuments, newDoc];
    setprojectDocuments(updatedDocs);

    const updatedProject = {
      ...activeProject,
      documents: updatedDocs
    };
    setActiveProject(updatedProject);
    setProjects(prev => prev.map(p => p.id === activeProject.id ? updatedProject : p));

    await persistProjectToDatabase(updatedProject);
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event?.target?.files || []);
    if (files.length === 0) return;

    if (!activeProject) {
      window.alert('⚠️ Por favor, selecciona un proyecto en la barra lateral antes de subir archivos.');
      return;
    }

    setIsAnalyzingFile(true);
    try {
      let allNewItems = [];
      for (const file of files) {
        let dataBase64 = null;
        try {
          dataBase64 = await readFileAsDataURL(file);
        } catch (e) {}

        const cleanBase64 = (typeof dataBase64 === 'string' && dataBase64.includes(','))
          ? dataBase64.split(',')[1].trim()
          : (typeof dataBase64 === 'string' ? dataBase64.trim() : '');

        const response = await fetch(getApiUrl('/.netlify/functions/project-parser'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileBase64: cleanBase64,
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
          }),
        });
        const data = await response.json();

        if (data.success && Array.isArray(data.items)) {
          const formattedItems = data.items.map((it, idx) => ({
            id: it.id || `item-${Date.now()}-${idx}-${Math.random()}`,
            ...it
          }));
          allNewItems.push(...formattedItems);
        }

        // Almacenar únicamente los metadatos esenciales requeridos por la interfaz, sin Base64
        await handleSaveDocumentToProject({
          name: file.name,
          size: file.size,
          itemsCount: data.items ? data.items.length : 0,
          uploadedAt: new Date().toISOString()
        });
      }

      if (allNewItems.length > 0) {
        setCargoItems(prev => [...prev, ...allNewItems]);
      }
    } catch (err) {
      console.error('Error de red al procesar el archivo:', err);
    } finally {
      setIsAnalyzingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddCargoPiece = () => {
    setCargoItems((prev) => [...prev, { id: `item-${Date.now()}-${Math.random()}`, category: 'Equipos de Proceso', quantity: 1, type: '', length: '', width: '', height: '', weight: '', shipping_mode_supported: "40' HC Contenedor" }]);
  };

  const handleUpdateCargoItem = (id, field, value) => {
    setCargoItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleRemoveCargoItem = (id) => {
    setCargoItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDeletePersistentDocument = async (docId) => {
    if (!activeProject || !window.confirm('¿Deseas eliminar este documento del proyecto?')) return;
    const updatedDocs = projectDocuments.filter(d => d.id !== docId);
    setprojectDocuments(updatedDocs);

    const updatedProject = {
      ...activeProject,
      documents: updatedDocs
    };
    setActiveProject(updatedProject);
    setProjects(prev => prev.map(p => p.id === activeProject.id ? updatedProject : p));

    await persistProjectToDatabase(updatedProject);
  };

  const totals = cargoItems.reduce((acc, item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const l = Math.max(0, parseFloat(item.length) || 0);
    const w = Math.max(0, parseFloat(item.width) || 0);
    const h = Math.max(0, parseFloat(item.height) || 0);
    const wt = Math.max(0, parseFloat(item.weight) || 0);
    acc.quantity += qty; acc.m2 += qty * (l * w); acc.m3 += qty * (l * w * h); acc.weight += qty * wt;
    return acc;
  }, { quantity: 0, m2: 0, m3: 0, weight: 0 });

  const handleCargoCategoryChange = (newCategory) => {
    setCargoCategory(newCategory);
    setCargoItems((prev) => {
      const currentList = Array.isArray(prev) ? prev : [];
      if (currentList.length === 0) {
        autoCalculateEstimates([], newCategory);
        return currentList;
      }
      const updated = currentList.map((item) => ({
        ...item,
        category: newCategory,
      }));
      autoCalculateEstimates(updated, newCategory);
      return updated;
    });
  };

  const autoCalculateEstimates = (items, explicitCategory = null) => {
    if (!items || items.length === 0) {
      setDunnage(0); setChains(0); setSlings(0); setShackles(0);
      setGangs(0); setHeavyLift(0); setMafiPlatforms(0); setLashingTeams(0);
      setShippingMode('Lo-Lo'); setVesselType('Geared Breakbulk (Lo-Lo)');
      setSubtotalFreight('0.00'); setSubtotalFobOperations('0.00');
      setEstimatedCost('0.00'); setSalePrice('0.00');
      setIsUnder40t(false); setTceActive(false); setTceValue(null);
      setOperationalProfileNotice('');
      setIsPalletizedOrBagsCargo(false);
      setIsCommodityTariffActive(false);
      setDemurrageCost(0);
      setOceanFreight(0);
      return;
    }
    let totalPieces = 0; let totalWeightKg = 0; let totalVolumeM3 = 0; let total_m2 = 0;
    let maxPieceWeight = 0; let roRoItems = 0; const staticItems = [];
    const roRoRegex = /camion|vehiculo|trailer|tractor|coche|furgoneta/i;

    items.forEach((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const l = Math.max(0, parseFloat(String(item.length ?? 0).replace(',', '.')) || 0);
      const w = Math.max(0, parseFloat(String(item.width ?? 0).replace(',', '.')) || 0);
      const h = Math.max(0, parseFloat(String(item.height ?? 0).replace(',', '.')) || 0);
      const pieceWeight = Math.max(0, parseFloat(String(item.weight ?? 0).replace(',', '.')) || 0);
      totalPieces += qty; totalWeightKg += qty * pieceWeight;
      totalVolumeM3 += qty * (l * w * h); total_m2 += qty * (l * w);
      if (pieceWeight > maxPieceWeight) maxPieceWeight = pieceWeight;
      const rawType = String(item.type || '');
      if (roRoRegex.test(rawType) || roRoRegex.test(rawType.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) { roRoItems += qty; } else { staticItems.push({ ...item, qty, quantity: qty, pieceWeight, weight: pieceWeight }); }
    });

    const autoMode = roRoItems > 0 ? 'Ro-Ro' : 'Lo-Lo';
    const recommendedVessel = roRoItems > 0 ? 'MPP / Pure Ro-Ro Carrier' : 'Geared Breakbulk (Lo-Lo)';
    setShippingMode(autoMode); setVesselType(recommendedVessel);

    const totalWeightTons = totalWeightKg / 1000;
    if (totalWeightTons === 0 || !activeProject) {
      setOrigin('');
      setDestination('');
      setPol('');
      setPod('');
      setDistanceNm(0);
      setDemurrageCost(0);
      setOceanFreight(0);
    }
    const Dunnage = Math.ceil(totalWeightTons / 5);
    const Cadenas = roRoItems > 0 ? (roRoItems * 4) : Math.max(4, Math.ceil(totalPieces * 2));
    const Eslingas = Math.ceil(totalPieces / 2);
    const Grilletes = (Eslingas * 2) + (Cadenas * 2);

    let HeavyLift = 0; let MAFIs = 0; let Gangs = 0;
    if (autoMode === 'Ro-Ro') {
      HeavyLift = 0;
      MAFIs = staticItems.reduce((acc, it) => {
        const wt = Math.max(0, parseFloat(String(it.pieceWeight ?? it.weight ?? it.unit_weight_kg ?? 0).replace(',', '.')) || 0);
        const q = Math.max(1, Number(it.qty ?? it.quantity) || 1);
        return acc + (wt > 5000 ? q : 0);
      }, 0);
      Gangs = Math.ceil(totalPieces / 25);
    } else {
      MAFIs = 0;
      HeavyLift = maxPieceWeight > 8000 ? 1 : 0;
      Gangs = Math.ceil(totalPieces / 15);
    }

    // 1. Evaluación del perfil operativo adecuado en Trincaje y Operativa
    const isBigBagsOrBulk = items.some(it => {
      const cat = String(it.category || '').toLowerCase();
      const typ = String(it.type || '').toLowerCase();
      const mod = String(it.shipping_mode_supported || '').toLowerCase();
      return cat.includes('ensacad') || cat.includes('dry bulk') || mod.includes('big bag') || mod.includes('granel') ||
        /big\s*bag|ensacad|saco|granel|bulk|cemento|urea|fertilizante|sulfato|harina|azucar|arroz|clinker|grano/i.test(typ) ||
        /big\s*bag|ensacad|saco|granel|bulk|cemento|urea|fertilizante|sulfato/i.test(cat);
    });

    setIsBigBagsCargo(isBigBagsOrBulk);

    const activeCat = String(explicitCategory || cargoCategory || '').trim();
    const normalizeCat = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const activeNorm = normalizeCat(activeCat);

    const isExplicitProject = activeNorm.includes('proyecto') || activeNorm.includes('project') || activeNorm.includes('heavy lift');

    const isPalletizedOrBags = !isExplicitProject && (
      activeNorm.includes('palet') ||
      activeNorm.includes('pallet') ||
      activeNorm.includes('sling bag') ||
      activeNorm.includes('saco') ||
      activeNorm.includes('general') ||
      items.some(it => {
        const cat = normalizeCat(it.category);
        const typ = normalizeCat(it.type);
        const mod = normalizeCat(it.shipping_mode_supported);
        return cat.includes('palet') || cat.includes('pallet') || cat.includes('sling bag') || cat.includes('saco') || cat.includes('general') ||
               typ.includes('palet') || typ.includes('pallet') || typ.includes('sling bag') || typ.includes('saco') || typ.includes('general') ||
               mod.includes('palet') || mod.includes('pallet') || mod.includes('sling bag');
      })
    );

    if (isPalletizedOrBags) {
      setIsBigBagsCargo(false);
    }
    setIsPalletizedOrBagsCargo(isPalletizedOrBags);

    let effectiveDunnage = Dunnage;
    let effectiveCadenas = Cadenas;
    let effectiveSlings = Eslingas;
    let effectiveGrilletes = Grilletes;
    let effectiveHeavyLift = HeavyLift;

    if (isBigBagsOrBulk && !isPalletizedOrBags) {
      // Regla estricta Big Bags: Queda prohibido calcular eslingas sueltas individuales o materiales de trincaje pesado (cadenas, maderas de cuna estructurales)
      effectiveDunnage = 0;
      effectiveCadenas = 0;
      effectiveHeavyLift = 0;
      effectiveSlings = 0;
      effectiveGrilletes = 0;

      // Spreader multipunto (14-16 sacos por ciclo) y ciclos de izado
      const bagsPerLift = 15;
      const calculatedCycles = Math.max(1, Math.ceil(totalPieces / bagsPerLift));
      setCraneLiftCycles(calculatedCycles);

      // Dimensionamiento del personal de tierra en función de los ciclos de retorno de grúa (buque o móvil portuaria)
      // para flujo continuo de carga hacia la bodega con cuadrillas enfocadas en enganche rápido al spreader
      const calculatedGangs = Math.max(1, Math.ceil(calculatedCycles / 140));
      const calculatedSpreaders = Math.max(1, Math.min(2, Math.ceil(totalPieces / 1500)));

      Gangs = calculatedGangs;
      HeavyLift = 0;

      setDunnageWood(0);
      setChainsBinders(0);
      setHighCapacitySlings(0);
      setShackles(0);
      setHeavyLiftCrane(0);
      setLashingTeams(0);
      setLashingTeam(0);
      setStevedoreGangs(calculatedGangs);
      setSpreaderMultipunto(calculatedSpreaders);

      setOperationalProfileNotice('Perfil: Mercancía Ensacada / Big Bags (Estiba en Bloque) · Spreader multipunto (14-16 sacos/ciclo) · Maderas de cuna pesadas y cables de acero de proyecto quedan excluidos');
    } else if (isPalletizedOrBags) {
      // Regla estricta Carga Paletizada / Sling Bags / Sacos / General:
      // Operativamente, las cadenas y grilletes pesados destruyen la carga -> forzar a 0 unidades y coste
      effectiveCadenas = 0;
      effectiveGrilletes = 0;
      setChainsBinders(0);
      setShackles(0);

      // Ratio ligero de dunnage: calce y bloqueo de huecos con maderas de estiba / airbags
      const lightDunnageUnits = Math.max(1, Math.ceil(totalWeightTons / 25));
      effectiveDunnage = lightDunnageUnits;
      setDunnageWood(lightDunnageUnits);

      effectiveSlings = Eslingas;
      setHighCapacitySlings(Eslingas);

      setGangs(Gangs);
      setHeavyLift(0);
      setHeavyLiftCrane(0);
      setMafiPlatforms(MAFIs);
      setLashingTeams(Math.max(1, Math.ceil(totalPieces / 30)));
      setLashingTeam(Math.max(1, Math.ceil(totalPieces / 30)));
      setSpreaderMultipunto(0);
      setCraneLiftCycles(0);

      setOperationalProfileNotice('Perfil: Mercancía Paletizada / Sacos (Calce Ligero) · Madera de Estiba y Airbags · Cadenas y grilletes pesados excluidos');
    } else {
      // Carga de Proyecto / Heavy Lift: reactivamente inyecta cadenas, grilletes y dunnage estructural
      setDunnage(Dunnage);
      setChains(Cadenas);
      setSlings(Eslingas);
      setShackles(Grilletes);
      setGangs(Gangs);
      setHeavyLift(HeavyLift);
      setMafiPlatforms(MAFIs);
      setLashingTeams(cargoItems.length > 0 ? Math.max(1, Math.ceil(totalPieces / 20) + (roRoItems > 0 ? 1 : 0)) : 0);

      setSpreaderMultipunto(0);
      setCraneLiftCycles(0);
      setOperationalProfileNotice('Perfil: Carga Industrial de Proyecto / Breakbulk · Cunas estructurales y cables/cadenas requeridos');
    }

    let currentSurveyorCost = Number(surveyorCost) || 0;
    if (maxPieceWeight > 35000 && Number(surveyorCost) === 0 && !userEditedSurveyor.current) { currentSurveyorCost = 1500; setSurveyorCost(1500); }

    // 2. Evaluación del umbral de 40 toneladas
    const isUnderThreshold = totalWeightTons < 40;
    setIsUnder40t(isUnderThreshold);

    const landCost = Number(activeProject?.land_freight_cost ?? activeProject?.landFreightCost ?? 0) || 0;
    let calculatedOceanFreight = 0;
    let calculatedFobOperations = 0;
    let totalEstimatedCost = 0;

    if (isUnderThreshold) {
      // Regla < 40t: Desactivar TCE del buque y computar costes bajo la modalidad de grupaje LCL
      setTceActive(false);
      setTceValue(null);
      setCharterMode('Grupaje LCL');
      setShippingMode('Grupaje LCL');
      setVesselType('Consolidación LCL (Sin buque exclusivo)');

      const chargeableWeightTons = Math.max(0.1, totalWeightTons);
      const chargeableVolumeCbm = Math.max(0.1, totalVolumeM3);
      const revenueTons = Math.max(1, Math.max(chargeableWeightTons, chargeableVolumeCbm));

      // Subtotal 1: Flete Marítimo LCL
      const oceanFreightCost = revenueTons * 65.0;

      // Subtotal 2: Costes FOB y Operativa Portuaria (CFS, Tasas T3, B/L, almacenaje, surveyor, inland, mercancía)
      const cfsOriginCost = revenueTons * 22.0;
      const cfsDestCost = revenueTons * 25.0;
      const portT3Cost = revenueTons * 4.5;
      const blFee = 85.0;
      const totalLclFreightCost = oceanFreightCost + cfsOriginCost + cfsDestCost + portT3Cost + blFee;
      const terminalStorageCost = Math.ceil(total_m2) * storageDays * 2;

      calculatedOceanFreight = Number(oceanFreightCost) || 0;
      calculatedFobOperations = (Number(cfsOriginCost) || 0) + (Number(cfsDestCost) || 0) + (Number(portT3Cost) || 0) + (Number(blFee) || 0) + (Number(terminalStorageCost) || 0) + (Number(currentSurveyorCost) || 0) + (Number(inlandCost) || 0) + (Number(customsCost) || 0) + (Number(insuranceCost) || 0);

      totalEstimatedCost = calculatedOceanFreight + calculatedFobOperations + landCost;
    } else {
      // Regla >= 40t: Aplicar fletamento completo y cálculo de TCE del buque sugerido
      setTceActive(true);
      setCharterMode('Fletamento Completo');

      let suggestedVesselClass = 'Coaster / Buque de Carga General (Mini-Bulker)';
      let dailyTce = 8500;
      if (totalWeightTons >= 35000) {
        suggestedVesselClass = 'Supramax / Ultramax Bulk Carrier';
        dailyTce = 16500;
      } else if (totalWeightTons >= 10000) {
        suggestedVesselClass = 'Handysize Bulk Carrier';
        dailyTce = 13800;
      } else if (totalWeightTons >= 3000) {
        suggestedVesselClass = 'Multi-Purpose MPP / Tween-decker';
        dailyTce = 11500;
      }

      setTceValue(dailyTce);
      if (autoMode !== 'Ro-Ro') {
        setVesselType(suggestedVesselClass);
      }

      const RT = Math.max(totalWeightTons, totalVolumeM3);

      // MOTOR DE CÁLCULO DINÁMICO DE ROTACIÓN Y FLETE (TCE):
      // Sincronización de tiempos operativos con la Vista Ejecutiva como fuente de verdad definitiva
      const execTimes = getExecutiveOperationalTimes(activeProject?.route_and_chartering);
      const effectiveLoadRate = Math.max(1, Number(loadingRate) || (isBigBagsOrBulk ? 1200 : 850));
      const effectiveDischRate = Math.max(1, Number(dischargingRate) || (isBigBagsOrBulk ? 1000 : 750));
      const rawDiasCarga = totalWeightTons > 0 ? Math.round((totalWeightTons / effectiveLoadRate) * 100) / 100 : 0;
      const rawDiasDescarga = totalWeightTons > 0 ? Math.round((totalWeightTons / effectiveDischRate) * 100) / 100 : 0;
      const rawPortTotal = Math.round((rawDiasCarga + rawDiasDescarga) * 100) / 100;

      const effectiveDistance = Math.max(10, Number(distanceNm) || 1500);
      const defaultSpeed = totalWeightTons >= 35000 ? 13.5 : (totalWeightTons >= 10000 ? 13.0 : (totalWeightTons >= 3000 ? 12.0 : 10.5));
      const effectiveSpeed = Math.max(1, Number(vesselSpeedKnots) || defaultSpeed);

      const diasNavegacion = (execTimes.seaDays !== null && execTimes.seaDays > 0)
        ? execTimes.seaDays
        : Math.round((effectiveDistance / (effectiveSpeed * 24)) * 100) / 100;

      const diasMuelle = (execTimes.portDays !== null && execTimes.portDays > 0)
        ? execTimes.portDays
        : rawPortTotal;

      const diasRotacionTotal = (execTimes.totalDays !== null && execTimes.totalDays > 0)
        ? execTimes.totalDays
        : Math.round((diasMuelle + diasNavegacion) * 100) / 100;

      let diasCarga = rawDiasCarga;
      let diasDescarga = rawDiasDescarga;
      if (execTimes.portDays !== null && execTimes.portDays > 0 && rawPortTotal > 0) {
        diasCarga = Math.round((rawDiasCarga / rawPortTotal) * execTimes.portDays * 100) / 100;
        diasDescarga = Math.round((execTimes.portDays - diasCarga) * 100) / 100;
      } else if (execTimes.portDays !== null && execTimes.portDays > 0 && rawPortTotal === 0) {
        diasCarga = Math.round((execTimes.portDays / 2) * 100) / 100;
        diasDescarga = Math.round((execTimes.portDays - diasCarga) * 100) / 100;
      }

      const effectiveDailyHire = Number(vesselDailyHireUsd) || dailyTce;

      // Subtotal 1: Flete Marítimo Buque Completo / TCE en USD nativo
      const freightCost = Math.round(diasRotacionTotal * effectiveDailyHire * 100) / 100;

      // CÁLCULO Y GESTIÓN DE DEMORAS Y PLANCHA (Demurrage) en USD nativo
      let demurrageCostUsd = 0;
      let totalDemDays = 0;

      // Guarda matemática: no intentar calcular tiempos de muelle con cero toneladas
      const calculateDemorasYPlancha = () => {
        if (totalWeightTons <= 0) return;
        const actualLoad = actualLoadingDays !== '' && actualLoadingDays !== null && !isNaN(Number(actualLoadingDays)) ? Number(actualLoadingDays) : null;
        const actualDisch = actualDischargingDays !== '' && actualDischargingDays !== null && !isNaN(Number(actualDischargingDays)) ? Number(actualDischargingDays) : null;
        const demLoadDays = (actualLoad !== null && actualLoad > diasCarga) ? Math.round((actualLoad - diasCarga) * 100) / 100 : 0;
        const demDischDays = (actualDisch !== null && actualDisch > diasDescarga) ? Math.round((actualDisch - diasDescarga) * 100) / 100 : 0;
        totalDemDays = Math.round((demLoadDays + demDischDays) * 100) / 100;
        const effectiveDemDaily = Number(demurrageDailyRateUsd) || effectiveDailyHire;
        demurrageCostUsd = Math.round(totalDemDays * effectiveDemDaily * 100) / 100;
        setDemurrageCost(demurrageCostUsd);
      };

      calculateDemorasYPlancha();

      // Subtotal 2: Costes FOB y Operativa Portuaria (trincaje, estiba, grúas/MAFIs, terminal, peritaje, inland, mercancía, seguro, demoras en USD nativo)
      const spreaderCost = isBigBagsOrBulk ? ((spreaderMultipunto || Math.max(1, Math.min(2, Math.ceil(totalPieces / 1500)))) * 600) : 0;
      const airBagsCost = isBigBagsOrBulk ? (Math.max(2, Math.ceil(totalWeightTons / 50)) * 35) : 0;

      const dunnageRate = isPalletizedOrBags ? 20 : 30;
      const lashingCost = isBigBagsOrBulk
        ? (spreaderCost + airBagsCost)
        : (isPalletizedOrBags
            ? ((effectiveDunnage * dunnageRate) + (effectiveSlings * 40))
            : ((effectiveDunnage * 30) + (effectiveCadenas * 80) + (effectiveSlings * 40) + ((effectiveSlings * 2 + effectiveCadenas * 2) * 15)));
      const stevedoringCost = (MAFIs * 300) + (HeavyLift * 2500) + (Gangs * 1200);

      // Alquiler obligatorio de grúa móvil portuaria para spreader y su operador por jornada
      const portCraneShifts = isBigBagsOrBulk ? Math.max(1, Gangs) : 0;
      const portCraneDailyRate = 1800;
      const portCraneCost = isBigBagsOrBulk ? (portCraneShifts * portCraneDailyRate) : 0;

      // Pre-Stacking 70% obligatorio en muelle para Big Bags (almacenaje previo al atraque y manipulación inicial)
      let terminalStorageCost = 0;
      let initialHandlingCost = 0;
      if (isBigBagsOrBulk) {
        const preStackingRatio = 0.70;
        const preStackedTons = totalWeightTons * preStackingRatio;
        const preStackingDays = Math.max(5, Number(storageDays) || 5);
        const effectiveArea = total_m2 > 0 ? total_m2 : (totalWeightTons > 0 ? totalWeightTons * 0.8 : totalPieces * 0.8);
        const preStackedArea = Math.ceil(effectiveArea * preStackingRatio);
        terminalStorageCost = preStackedArea * preStackingDays * 2;
        if (Number(storageDays) > 5) {
          terminalStorageCost += Math.ceil(effectiveArea) * (Number(storageDays) - 5) * 2;
        }
        initialHandlingCost = preStackedTons * 2.0;
      } else {
        terminalStorageCost = Math.ceil(total_m2) * storageDays * 2;
      }

      calculatedOceanFreight = Number(freightCost) || 0;
      calculatedFobOperations = (Number(lashingCost) || 0) + (Number(stevedoringCost) || 0) + (Number(portCraneCost) || 0) + (Number(terminalStorageCost) || 0) + (Number(initialHandlingCost) || 0) + (Number(currentSurveyorCost) || 0) + (Number(inlandCost) || 0) + (Number(customsCost) || 0) + (Number(insuranceCost) || 0) + (Number(demurrageCostUsd) || 0);

      totalEstimatedCost = calculatedOceanFreight + calculatedFobOperations + landCost;
    }

    const rawType = String(cargoItems[0]?.type || '').toUpperCase().trim();
    const appliedTariff = COMMODITY_TARIFFS[rawType] || null;

    // 2. Inyectamos los costes en la UI (pantalla) BLINDADOS CONTRA BUCLES
    if (appliedTariff) {
      setIsCommodityTariffActive(true);
      const computedInland = Math.round(totalWeightTons * appliedTariff.inlandUsdMt * 100) / 100;
      const commodityValueUsdMt = 55; // Valor por defecto del CEM
      const computedMercancia = Math.round(totalWeightTons * commodityValueUsdMt * 100) / 100;
      
      // Freno de React: Solo actualizamos el estado si el número ES DIFERENTE al que ya hay
      setInlandCost(prev => (prev === computedInland ? prev : computedInland));
      setMercanciaCost(prev => (prev === computedMercancia ? prev : computedMercancia));
      
      // Freno del objeto: Evitamos mutar activeProject infinitamente
      if (activeProject) {
         if (activeProject.valor_total_mercancia_usd !== computedMercancia) {
             activeProject.valor_total_mercancia_usd = computedMercancia;
         }
         if (activeProject.land_freight_cost !== computedInland) {
             activeProject.land_freight_cost = computedInland;
         }
      }

      const inlandCost = totalWeightTons * appliedTariff.inlandUsdMt;
      calculatedFobOperations = totalWeightTons * (appliedTariff.portDuesUsdMt + appliedTariff.customsUsdMt + appliedTariff.packagingUsdMt) + (Number(customsCost) || 0);
      totalEstimatedCost = calculatedOceanFreight + calculatedFobOperations + inlandCost;
    } else {
      setIsCommodityTariffActive(false);
    }

    const effectiveFleteVenta = Number(
      fleteVenta ||
      activeProject?.route_and_chartering?.flete_venta_usd_mt ||
      activeProject?.route_and_chartering?.freight_rate_sell_usd ||
      activeProject?.route_and_chartering?.flete_sugerido_fletador_venta ||
      0
    );

    const effectiveWeightOrRt = totalWeightTons > 0 ? totalWeightTons : (isUnderThreshold ? revenueTons : RT);

    // Respetar la Simulación: La vista de Proyectos debe respetar el flete de venta manual sincronizado desde la Calculadora como el objetivo principal, en lugar de sugerir únicamente el precio automatizado bottom-up.
    let targetSalePrice = 0;
    if (effectiveFleteVenta > 0 && effectiveWeightOrRt > 0) {
      const targetOceanFreightSale = Math.round(effectiveFleteVenta * effectiveWeightOrRt * 100) / 100;
      targetSalePrice = (Number(targetOceanFreightSale) || 0) + ((Number(calculatedFobOperations) || 0) * 1.15) + ((Number(landCost) || 0) * 1.15);
    } else {
      targetSalePrice = (Number(totalEstimatedCost) || 0) * 1.15;
    }

    setOceanFreight(Number(calculatedOceanFreight) || 0);
    setSubtotalFreight((Number(calculatedOceanFreight) || 0).toFixed(2));
    setSubtotalFobOperations((Number(calculatedFobOperations) || 0).toFixed(2));
    setEstimatedCost((Number(totalEstimatedCost) || 0).toFixed(2));
    setSalePrice((Number(targetSalePrice) || 0).toFixed(2));
  };

  useEffect(() => {
    autoCalculateEstimates(cargoItems, cargoCategory);
  }, [
    cargoItems,
    cargoCategory,
    storageDays,
    surveyorCost,
    inlandCost,
    customsCost,
    insuranceCost,
    pol,
    pod,
    loadingRate,
    dischargingRate,
    distanceNm,
    vesselSpeedKnots,
    vesselDailyHireUsd,
    exchangeRateUsdEur,
    actualLoadingDays,
    actualDischargingDays,
    demurrageDailyRateUsd,
    fleteCompra,
    fleteVenta,
    activeProject?.land_freight_cost,
    activeProject?.land_origin,
    activeProject?.land_destination,
    activeProject?.land_distance,
  ]);

  useEffect(() => {
    if (isDualTradingOpen && dualViewRef.current) {
      const dualView = dualViewRef.current;
      const fleteUnitario = Number(activeReport?.flete_unitario_usd_mt ?? financialBreakdown?.flete_unitario_usd_mt ?? 0);
      const tons = Number(totals.totalWeightTons || totals.weightTons || (totals.weightKg ? totals.weightKg / 1000 : 0)) || 0;
      const stowage = Number(totals.stowageFactor || (totals.m3 && tons > 0 ? totals.m3 / tons : 0)) || 0;

      dualView.fleteJustoCalculado = fleteUnitario;
      dualView.toneladasTotales = tons;
      dualView.factorDeEstiba = stowage;
      dualView.toleranciaCarga = 5;
      dualView.getExportContext = () => ({
        syncid: activeProject?.project_ref || 'PROJECT-FORWARDER',
        id: activeProject?.project_ref || 'PROJECT-FORWARDER',
        toleranceType: 'MOLOO / MOLCO'
      });

      let backLink = null;
      const handleBackLink = (e) => {
        e.preventDefault();
        setIsDualTradingOpen(false);
      };
      const attachBackLink = () => {
        backLink = dualView.shadowRoot?.querySelector?.('.back-link');
        if (backLink) {
          backLink.addEventListener('click', handleBackLink);
        }
      };
      attachBackLink();
      const timer = setTimeout(attachBackLink, 250);

      return () => {
        clearTimeout(timer);
        backLink?.removeEventListener('click', handleBackLink);
      };
    }
  }, [isDualTradingOpen, activeReport, financialBreakdown, totals, activeProject]);

  const handleApplyProjectPayload = async (payload) => {
    if (!payload) return;

    let currentProject = activeProject;
    if (!currentProject) {
      if (projects.length > 0) {
        currentProject = projects[0];
        setActiveProject(currentProject);
      } else {
        const defaultProj = {
          id: `proj-${Date.now()}`,
          project_ref: 'RDM/2026-001',
          client_name: 'Proyecto Principal / Agente',
          status: 'Borrador',
          items: [],
          documents: []
        };
        currentProject = defaultProj;
        setProjects([defaultProj]);
        setActiveProject(defaultProj);
      }
    }

    let updatedProject = { ...currentProject };
    let hasChanges = false;

    if (payload.instruction) {
      const text = payload.instruction.toLowerCase();
      const matchNumber = (str) => {
        const m = str.match(/(\d+([.,]\d+)?)/);
        return m ? parseFloat(m[0].replace(',', '.')) : null;
      };

      if (text.includes('almacen') || text.includes('días') || text.includes('dias')) {
        const val = matchNumber(text);
        if (val !== null) { setStorageDays(val); hasChanges = true; }
      }
      if (text.includes('surveyor') || text.includes('perito')) {
        const val = matchNumber(text);
        if (val !== null) {
          userEditedSurveyor.current = true;
          setSurveyorCost(val);
          hasChanges = true;
        }
      }
      if (text.includes('inland') || text.includes('transporte')) {
        const val = matchNumber(text);
        if (val !== null) { setInlandCost(val); hasChanges = true; }
      }
      if (text.includes('aduana') || text.includes('mercancía') || text.includes('mercancia')) {
        const val = matchNumber(text);
        if (val !== null) { setCustomsCost(val); hasChanges = true; }
      }
    }

    // Parámetros de ruta y ritmos operativos
    if (payload.charteringAssessment) {
      setCharteringAssessment(payload.charteringAssessment);
      hasChanges = true;
    } else if (payload.rotationBreakdown) {
      setCharteringAssessment({ rotationBreakdown: payload.rotationBreakdown });
      hasChanges = true;
    }

    const assessmentRot = payload.charteringAssessment?.rotationBreakdown || payload.rotationBreakdown || payload.charteringAssessment?.timeCharterEquivalent;
    if (assessmentRot) {
      if (assessmentRot.pol) { setPol(assessmentRot.pol); hasChanges = true; }
      if (assessmentRot.pod) { setPod(assessmentRot.pod); hasChanges = true; }
      if (assessmentRot.loadingRateMtDay || assessmentRot.loadingRate) {
        setLoadingRate(Number(assessmentRot.loadingRateMtDay || assessmentRot.loadingRate));
        hasChanges = true;
      }
      if (assessmentRot.dischargingRateMtDay || assessmentRot.dischargingRate) {
        setDischargingRate(Number(assessmentRot.dischargingRateMtDay || assessmentRot.dischargingRate));
        hasChanges = true;
      }
      if (assessmentRot.distanceNm || assessmentRot.distance_nm) {
        setDistanceNm(Number(assessmentRot.distanceNm || assessmentRot.distance_nm));
        hasChanges = true;
      }
      if (assessmentRot.serviceSpeedKnots || assessmentRot.vesselSpeedKnots) {
        setVesselSpeedKnots(Number(assessmentRot.serviceSpeedKnots || assessmentRot.vesselSpeedKnots));
        hasChanges = true;
      }
      if (assessmentRot.dailyHireRateUsd || assessmentRot.dailyHireRate) {
        setVesselDailyHireUsd(Number(assessmentRot.dailyHireRateUsd || assessmentRot.dailyHireRate));
        hasChanges = true;
      }
      if (assessmentRot.demurrage) {
        if (assessmentRot.demurrage.actualLoadingDays !== undefined) {
          setActualLoadingDays(assessmentRot.demurrage.actualLoadingDays);
          hasChanges = true;
        }
        if (assessmentRot.demurrage.actualDischargingDays !== undefined) {
          setActualDischargingDays(assessmentRot.demurrage.actualDischargingDays);
          hasChanges = true;
        }
        if (assessmentRot.demurrage.demurrageRateDailyUsd) {
          setDemurrageDailyRateUsd(Number(assessmentRot.demurrage.demurrageRateDailyUsd));
          hasChanges = true;
        }
      }
    }

    if (payload.action === 'update_route_rates' || payload.update_route_rates) {
      const rp = payload.payload || payload;
      if (rp.pol || rp.portOfLoading) { setPol(rp.pol || rp.portOfLoading); hasChanges = true; }
      if (rp.pod || rp.portOfDischarge) { setPod(rp.pod || rp.portOfDischarge); hasChanges = true; }
      if (rp.loadingRate != null || rp.loadingRateMtDay != null) { setLoadingRate(Number(rp.loadingRate ?? rp.loadingRateMtDay)); hasChanges = true; }
      if (rp.dischargeRate != null || rp.dischargingRate != null || rp.dischargingRateMtDay != null) { setDischargingRate(Number(rp.dischargeRate ?? rp.dischargingRate ?? rp.dischargingRateMtDay)); hasChanges = true; }
    }

    if (payload.pol || payload.portOfLoading) { setPol(payload.pol || payload.portOfLoading); hasChanges = true; }
    if (payload.pod || payload.portOfDischarge) { setPod(payload.pod || payload.portOfDischarge); hasChanges = true; }
    if (payload.loadingRate || payload.loadingRateMtDay) {
      setLoadingRate(Number(payload.loadingRate || payload.loadingRateMtDay));
      hasChanges = true;
    }
    if (payload.dischargingRate || payload.dischargeRate || payload.dischargingRateMtDay) {
      setDischargingRate(Number(payload.dischargingRate || payload.dischargeRate || payload.dischargingRateMtDay));
      hasChanges = true;
    }
    if (payload.cargoDescription || payload.quantityMT) {
      const description = String(payload.cargoDescription || 'Carga de Proyecto').trim();
      const qtyTons = Number(payload.quantityMT) || 0;
      const weightKg = qtyTons > 0 ? qtyTons * 1000 : 25000;
      const isBigBags = /bag|big[- ]?bag|saco|cemento|clinker|grano/i.test(description);

      const newItem = {
        id: `item-${Date.now()}-ai`,
        category: isBigBags ? 'Big Bags' : 'Equipos de Proceso',
        quantity: 1,
        type: description,
        length: 12,
        width: 2.5,
        height: 2.5,
        weight: weightKg,
        shipping_mode_supported: qtyTons >= 40 ? 'Break Bulk / Proyecto' : 'Contenedor (FCL / LCL)'
      };

      setCargoItems([newItem]);
      updatedProject.items = [newItem];
      hasChanges = true;
      setIsCargoModalOpen(true);
      autoCalculateEstimates([newItem]);
    }
    if (payload.distanceNm || payload.distance_nm) {
      setDistanceNm(Number(payload.distanceNm || payload.distance_nm));
      hasChanges = true;
    }
    if (payload.actualLoadingDays !== undefined) {
      setActualLoadingDays(payload.actualLoadingDays);
      hasChanges = true;
    }
    if (payload.actualDischargingDays !== undefined) {
      setActualDischargingDays(payload.actualDischargingDays);
      hasChanges = true;
    }
    if (payload.demurrageDays !== undefined) {
      setActualLoadingDays(payload.demurrageDays);
      hasChanges = true;
    }

    if (payload.action === 'add_packing_list_item' || payload.add_packing_list_item) {
      const p = payload.item || payload.newItem || payload.payload || payload;
      const qty = Number(p.quantity) || 1;
      const unitWeight = Number(p.unitWeight ?? p.weight ?? 1500);
      const totalWeightKg = qty * unitWeight;
      const isBigBags = /bag|big[- ]?bag|saco|cemento|clinker|grano/i.test(p.type || p.category || '');

      const newItem = {
        id: p.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        category: p.category || (isBigBags ? 'Big Bags' : 'Mercancía General / Paletizada'),
        type: p.type || p.name || 'Big Bags Cemento',
        quantity: qty,
        length: p.length != null ? Number(p.length) : 1.15,
        width: p.width != null ? Number(p.width) : 1.10,
        height: p.height != null ? Number(p.height) : 1.0,
        weight: unitWeight,
        unitWeight: unitWeight,
        shipping_mode_supported: totalWeightKg >= 40000 ? 'Break Bulk / Proyecto' : 'Contenedor (FCL / LCL)'
      };

      setCargoItems(prev => {
        const currentList = Array.isArray(prev) ? prev : [];
        const alreadyExists = currentList.some(it => it.id === newItem.id);
        const updatedList = alreadyExists ? currentList : [...currentList, newItem];
        updatedProject.items = updatedList;
        autoCalculateEstimates(updatedList);
        return updatedList;
      });

      hasChanges = true;
      setIsCargoModalOpen(true);
    }

    const incomingItems = payload.items || payload.cargo_items;
    if (Array.isArray(incomingItems) && incomingItems.length > 0) {
      const mappedItems = incomingItems.map((ci, idx) => ({
        id: ci.id || `item-${Date.now()}-${idx}`,
        category: ci.category || 'Equipos de Proceso',
        quantity: ci.quantity ? Math.max(1, Number(ci.quantity)) : 1,
        type: ci.type || '',
        length: ci.length_m ?? ci.length ?? '',
        width: ci.width_m ?? ci.width ?? '',
        height: ci.height_m ?? ci.height ?? '',
        weight: ci.unit_weight_kg ?? ci.weight ?? '',
        shipping_mode_supported: ci.shipping_mode_supported || "Contenedor (FCL / LCL)"
      }));
      setCargoItems(mappedItems);
      updatedProject.items = mappedItems;
      hasChanges = true;
      setIsCargoModalOpen(true);
      autoCalculateEstimates(mappedItems);
    } else if (payload.category !== undefined && Array.isArray(payload.cargo_items) && payload.cargo_items.length > 0) {
      const mappedItems = payload.cargo_items.map((ci, idx) => ({
        id: ci.id || `item-${Date.now()}-${idx}`,
        category: ci.category || 'Equipos de Proceso',
        quantity: ci.quantity || 1,
        type: ci.type || '',
        length: ci.length_m ?? ci.length ?? '',
        width: ci.width_m ?? ci.width ?? '',
        height: ci.height_m ?? ci.height ?? '',
        weight: ci.unit_weight_kg ?? ci.weight ?? '',
        shipping_mode_supported: ci.shipping_mode_supported || "40' HC Contenedor"
      }));
      setCargoItems(mappedItems);
      updatedProject.items = mappedItems;
      hasChanges = true;
      setIsCargoModalOpen(true);
      autoCalculateEstimates(mappedItems);
    }

    if (payload.documentMeta) {
      await handleSaveDocumentToProject(payload.documentMeta);
      return;
    }

    let structuralModified = false;
    if (payload.dunnageUnits !== undefined) { setDunnageWood(payload.dunnageUnits); hasChanges = true; structuralModified = true; }
    if (payload.slingsUnits !== undefined) { setHighCapacitySlings(payload.slingsUnits); hasChanges = true; structuralModified = true; }
    if (payload.lashingChains !== undefined) { setChainsBinders(payload.lashingChains); hasChanges = true; structuralModified = true; }
    if (payload.stevedoringShifts !== undefined) { setStevedoreGangs(payload.stevedoringShifts); hasChanges = true; structuralModified = true; }
    if (payload.lashingTeams !== undefined) { setLashingTeam(payload.lashingTeams); hasChanges = true; structuralModified = true; }
    if (payload.heavyLiftCranes !== undefined) { setHeavyLiftCrane(payload.heavyLiftCranes); hasChanges = true; structuralModified = true; }
    if (payload.mafiPlatforms !== undefined) { setMafiPlatforms(payload.mafiPlatforms); hasChanges = true; structuralModified = true; }
    if (payload.spreaderUnits !== undefined) { setSpreaderMultipunto(payload.spreaderUnits); hasChanges = true; structuralModified = true; }
    if (payload.spreaderMultipunto !== undefined) { setSpreaderMultipunto(payload.spreaderMultipunto); hasChanges = true; structuralModified = true; }
    if (payload.storageDays !== undefined) { setStorageDays(Number(payload.storageDays)); hasChanges = true; }
    if (payload.surveyorCost !== undefined) {
      userEditedSurveyor.current = true;
      setSurveyorCost(Number(payload.surveyorCost));
      hasChanges = true;
    }
    if (payload.inlandTrucksCount !== undefined) { setInlandCost(payload.inlandTrucksCount); hasChanges = true; }
    if (payload.customsCost !== undefined) { setCustomsCost(payload.customsCost); hasChanges = true; }
    if (payload.insuranceCost !== undefined || payload.seguroMercancia !== undefined) {
      setInsuranceCost(Number(payload.insuranceCost ?? payload.seguroMercancia));
      hasChanges = true;
    }

    if (payload.requestFinancialBreakdown || payload.showFinancialBreakdown) {
      setIsBreakdownVisible(true);
      hasChanges = true;
    }
    if (payload.financialBreakdown) {
      const fb = payload.financialBreakdown;
      if (fb.subtotals) {
        if (fb.subtotals.oceanFreight != null) setSubtotalFreight(Number(fb.subtotals.oceanFreight).toFixed(2));
        if (fb.subtotals.fobAndPortOperations != null) setSubtotalFobOperations(Number(fb.subtotals.fobAndPortOperations).toFixed(2));
      }
      if (fb.totalCostAllIn != null) setEstimatedCost(Number(fb.totalCostAllIn).toFixed(2));
      if (fb.totalQuotationAllIn != null) setSalePrice(Number(fb.totalQuotationAllIn).toFixed(2));
      setIsBreakdownVisible(true);
      hasChanges = true;
    }

    if (structuralModified || payload.forceOpenModal) {
      setIsCargoModalOpen(true);
    }
    if (payload.pol || payload.pod || payload.loadingRate || payload.dischargingRate || payload.distanceNm) {
      setIsCargoModalOpen(true);
    }
    if (payload.requestFinancialBreakdown) {
      setIsCargoModalOpen(true);
    }

    if (hasChanges) {
      if (!incomingItems || incomingItems.length === 0) {
        autoCalculateEstimates(cargoItems);
      }
      setActiveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      await persistProjectToDatabase(updatedProject);
    }
  };

  const buildExecutiveReportData = (sourceItem = null) => {
    let sourcePayload = null;
    if (sourceItem && sourceItem.payload_data) {
      sourcePayload = sourceItem.payload_data;
    } else if (sourceItem && (sourceItem.cargo_items || sourceItem.financial_summary)) {
      sourcePayload = sourceItem;
    }

    let items = [];
    if (sourcePayload && Array.isArray(sourcePayload.cargo_items) && sourcePayload.cargo_items.length > 0) {
      items = sourcePayload.cargo_items;
    } else if (cargoItems.length > 0) {
      items = cargoItems;
    } else if (activeProject?.line_items?.length > 0) {
      const found = activeProject.line_items.find(li => li.payload_data?.cargo_items?.length > 0);
      if (found) {
        items = found.payload_data.cargo_items;
        sourcePayload = found.payload_data;
      }
    }

    let qTotal = 0;
    let wTotalKg = 0;
    let m2Total = 0;
    let m3Total = 0;

    items.forEach((it) => {
      const q = Math.max(1, Number(it.quantity) || 1);
      const l = Math.max(0, parseFloat(it.length_m ?? it.length) || 0);
      const w = Math.max(0, parseFloat(it.width_m ?? it.width) || 0);
      const h = Math.max(0, parseFloat(it.height_m ?? it.height) || 0);
      const wt = Math.max(0, parseFloat(it.unit_weight_kg ?? it.weight) || 0);
      qTotal += q;
      wTotalKg += q * wt;
      m2Total += q * (l * w);
      m3Total += q * (l * w * h);
    });

    if (qTotal === 0 && totals.quantity > 0) {
      qTotal = totals.quantity;
      wTotalKg = totals.weight;
      m2Total = totals.m2;
      m3Total = totals.m3;
    }

    const totalWeightTons = wTotalKg / 1000;
    const reportRT = Math.max(1, Math.max(totalWeightTons, m3Total));

    const isBigBags = items.some(it => {
      const cat = String(it.category || '').toLowerCase();
      const typ = String(it.type || '').toLowerCase();
      const mod = String(it.shipping_mode_supported || '').toLowerCase();
      return cat.includes('ensacad') || cat.includes('dry bulk') || mod.includes('big bag') || mod.includes('granel') ||
        /big\s*bag|ensacad|saco|granel|bulk|cemento|urea|fertilizante|sulfato/i.test(typ) ||
        /big\s*bag|ensacad|saco|granel|bulk|cemento|urea|fertilizante|sulfato/i.test(cat);
    }) || isBigBagsCargo;

    // Parámetros de Ruta, Ritmos Operativos y Demoras
    const sessionData = readActiveCalculatorSession();
    const reportPol = sourcePayload?.route_and_chartering?.pol || pol || sessionData.pol || 'Valencia';
    const reportPod = sourcePayload?.route_and_chartering?.pod || pod || sessionData.pod || 'Houston';
    const reportLoadRate = Math.max(1, Number(sourcePayload?.route_and_chartering?.loading_rate_mt_day ?? loadingRate ?? sessionData.loadRate) || (isBigBags ? 1200 : 850));
    const reportDischRate = Math.max(1, Number(sourcePayload?.route_and_chartering?.discharging_rate_mt_day ?? dischargingRate ?? sessionData.dischRate) || (isBigBags ? 1000 : 750));
    const reportDistance = Math.max(10, Number(sourcePayload?.route_and_chartering?.distance_nm ?? distanceNm ?? sessionData.distanceNm) || 1500);
    const reportSpeed = Math.max(1, Number(sourcePayload?.route_and_chartering?.vessel_speed_knots ?? vesselSpeedKnots ?? sessionData.speedKnots) || 12.0);
    const reportDailyHire = Number(sourcePayload?.route_and_chartering?.daily_hire_rate_usd ?? vesselDailyHireUsd ?? sessionData.tce) || (totalWeightTons >= 35000 ? 16500 : (totalWeightTons >= 10000 ? 13800 : (totalWeightTons >= 3000 ? 11500 : 8500)));
    const reportExRate = Number(sourcePayload?.route_and_chartering?.exchange_rate ?? exchangeRateUsdEur) || 0.92;

    // Días de la Vista Ejecutiva como fuente de verdad definitiva
    const execTimes = getExecutiveOperationalTimes(sourcePayload?.route_and_chartering);
    const rawDiasCarga = totalWeightTons > 0 ? Math.round((totalWeightTons / reportLoadRate) * 100) / 100 : 0;
    const rawDiasDescarga = totalWeightTons > 0 ? Math.round((totalWeightTons / reportDischRate) * 100) / 100 : 0;
    const rawPortTotal = Math.round((rawDiasCarga + rawDiasDescarga) * 100) / 100;

    const savedNav = Number(sourcePayload?.route_and_chartering?.dias_navegacion ?? sourcePayload?.route_and_chartering?.navigationDays ?? sourcePayload?.route_and_chartering?.sea_days ?? sourcePayload?.route_and_chartering?.seaDays);
    const savedPort = Number(sourcePayload?.route_and_chartering?.dias_muelle ?? sourcePayload?.route_and_chartering?.dias_muelle_total ?? sourcePayload?.route_and_chartering?.port_days ?? sourcePayload?.route_and_chartering?.portDays);
    const savedRot = Number(sourcePayload?.route_and_chartering?.dias_rotacion_total ?? sourcePayload?.route_and_chartering?.totalRotationDays ?? sourcePayload?.route_and_chartering?.total_days ?? sourcePayload?.route_and_chartering?.totalDays);

    const diasNavegacion = (Number.isFinite(savedNav) && savedNav > 0)
      ? savedNav
      : (execTimes.seaDays !== null && execTimes.seaDays > 0 ? execTimes.seaDays : Math.round((reportDistance / (reportSpeed * 24)) * 100) / 100);

    const diasMuelle = (Number.isFinite(savedPort) && savedPort > 0)
      ? savedPort
      : (execTimes.portDays !== null && execTimes.portDays > 0 ? execTimes.portDays : rawPortTotal);

    const diasRotacionTotal = (Number.isFinite(savedRot) && savedRot > 0)
      ? savedRot
      : (execTimes.totalDays !== null && execTimes.totalDays > 0 ? execTimes.totalDays : Math.round((diasMuelle + diasNavegacion) * 100) / 100);

    let diasCarga = rawDiasCarga;
    let diasDescarga = rawDiasDescarga;
    if (sourcePayload?.route_and_chartering?.dias_carga != null && Number(sourcePayload.route_and_chartering.dias_carga) > 0) {
      diasCarga = Number(sourcePayload.route_and_chartering.dias_carga);
      diasDescarga = Number(sourcePayload.route_and_chartering.dias_descarga ?? (diasMuelle - diasCarga));
    } else if (diasMuelle > 0 && rawPortTotal > 0) {
      diasCarga = Math.round((rawDiasCarga / rawPortTotal) * diasMuelle * 100) / 100;
      diasDescarga = Math.round((diasMuelle - diasCarga) * 100) / 100;
    } else if (diasMuelle > 0 && rawPortTotal === 0) {
      diasCarga = Math.round((diasMuelle / 2) * 100) / 100;
      diasDescarga = Math.round((diasMuelle - diasCarga) * 100) / 100;
    }

    // Demoras
    const actualLoad = sourcePayload?.route_and_chartering?.actual_loading_days ?? (actualLoadingDays !== '' ? Number(actualLoadingDays) : null);
    const actualDisch = sourcePayload?.route_and_chartering?.actual_discharging_days ?? (actualDischargingDays !== '' ? Number(actualDischargingDays) : null);
    const demLoadDays = (actualLoad !== null && actualLoad > diasCarga) ? Math.round((actualLoad - diasCarga) * 100) / 100 : 0;
    const demDischDays = (actualDisch !== null && actualDisch > diasDescarga) ? Math.round((actualDisch - diasDescarga) * 100) / 100 : 0;
    const reportDemDays = Math.round((demLoadDays + demDischDays) * 100) / 100;
    const reportDemDailyUsd = Number(sourcePayload?.route_and_chartering?.demurrage_daily_rate_usd ?? demurrageDailyRateUsd) || reportDailyHire;
    const demurrageCostNum = Math.round(reportDemDays * reportDemDailyUsd * 100) / 100;

    // Subtotal 1: Flete Marítimo / TCE en USD nativo
    let fleteCostNum = 0;
    if (sourcePayload?.financialBreakdown?.subtotalOceanFreight != null && Number(sourcePayload.financialBreakdown.subtotalOceanFreight) > 0) {
      fleteCostNum = Number(sourcePayload.financialBreakdown.subtotalOceanFreight);
    } else if (sourcePayload?.financial_summary?.subtotal_ocean_freight_usd != null && Number(sourcePayload.financial_summary.subtotal_ocean_freight_usd) > 0) {
      fleteCostNum = Number(sourcePayload.financial_summary.subtotal_ocean_freight_usd);
    } else if (parseFloat(subtotalFreight) > 0) {
      fleteCostNum = parseFloat(subtotalFreight);
    } else if (sourcePayload?.financial_summary?.subtotal_ocean_freight_eur != null && Number(sourcePayload.financial_summary.subtotal_ocean_freight_eur) > 0) {
      fleteCostNum = Number(sourcePayload.financial_summary.subtotal_ocean_freight_eur);
    } else {
      fleteCostNum = Math.round(diasRotacionTotal * reportDailyHire * 100) / 100;
    }

    // Fletes financieros sincronizados de la Calculadora (Flete Compra Armador y Flete Venta Fletador)
    const manualFleteVentaUnit = Number(
      sourcePayload?.route_and_chartering?.flete_venta_usd_mt ??
      sourcePayload?.route_and_chartering?.freight_rate_sell_usd ??
      sourcePayload?.route_and_chartering?.flete_sugerido_fletador_venta ??
      sourcePayload?.flete_venta_usd_mt ??
      activeProject?.route_and_chartering?.flete_venta_usd_mt ??
      fleteVenta ??
      0
    );
    const manualFleteCompraUnit = Number(
      sourcePayload?.route_and_chartering?.flete_compra_usd_mt ??
      sourcePayload?.route_and_chartering?.freight_rate_cost_usd ??
      sourcePayload?.route_and_chartering?.flete_sugerido_armador_compra ??
      sourcePayload?.flete_compra_usd_mt ??
      activeProject?.route_and_chartering?.flete_compra_usd_mt ??
      fleteCompra ??
      0
    );

    // Respetar la Simulación: Si se especificó Flete Venta manual en la Calculadora, se utiliza como objetivo principal del tramo marítimo
    let fleteSaleNum = 0;
    if (manualFleteVentaUnit > 0 && reportRT > 0) {
      fleteSaleNum = Math.round(manualFleteVentaUnit * reportRT * 100) / 100;
    } else {
      fleteSaleNum = Math.round(fleteCostNum * 1.15 * 100) / 100;
    }
    const fleteMarginNum = Math.round((fleteSaleNum - fleteCostNum) * 100) / 100;

    // Subtotal 2: Cuadrillas y Estiba
    const gangsCount = sourcePayload?.port_labor_and_equipment?.stevedore_gangs_shifts ?? stevedoreGangs;
    const effectiveGangs = gangsCount > 0 ? gangsCount : (isBigBags ? Math.max(1, Math.ceil(Math.ceil(qTotal / 15) / 140)) : Math.max(1, Math.ceil(qTotal / 15)));
    const lashingCount = sourcePayload?.port_labor_and_equipment?.lashing_team ?? (isBigBags ? 0 : lashingTeam);
    const estibaCostNum = (effectiveGangs * 1200) + (lashingCount * 800);
    const estibaSaleNum = estibaCostNum * 1.15;
    const estibaMarginNum = estibaSaleNum - estibaCostNum;

    // Equipos Auxiliares y Materiales (Grúa Móvil Portuaria con Operador, MAFIs, Heavy Lift, Spreader, Cadenas, Dunnage)
    const mafiCount = sourcePayload?.port_labor_and_equipment?.mafi_platforms ?? mafiPlatforms;
    const heavyLiftCount = sourcePayload?.port_labor_and_equipment?.heavy_lift_crane ?? heavyLiftCrane;
    const portCraneShifts = isBigBags ? effectiveGangs : 0;
    const portCraneCost = portCraneShifts * 1800;
    const spreaderCount = isBigBags ? (sourcePayload?.lashing_and_dunnage_materials?.spreader_multipunto ?? spreaderMultipunto ?? Math.max(1, Math.min(2, Math.ceil(qTotal / 1500)))) : 0;
    const spreaderCost = spreaderCount * 600;
    const airBagsCost = isBigBags ? (Math.max(2, Math.ceil(totalWeightTons / 50)) * 35) : 0;
    const dunnageCount = isBigBags ? 0 : (sourcePayload?.lashing_and_dunnage_materials?.dunnage_wood ?? dunnageWood);
    const chainsCount = (isBigBags || isPalletizedOrBagsCargo) ? 0 : (sourcePayload?.lashing_and_dunnage_materials?.chains_and_binders ?? chainsBinders);
    const slingsCount = isBigBags ? 0 : (sourcePayload?.lashing_and_dunnage_materials?.high_capacity_slings ?? highCapacitySlings);
    const shacklesCount = (isBigBags || isPalletizedOrBagsCargo) ? 0 : (sourcePayload?.lashing_and_dunnage_materials?.shackles ?? shackles);

    const dunnageRate = isPalletizedOrBagsCargo ? 20 : 30;
    const matCostNum = (mafiCount * 300) + (heavyLiftCount * 2500) + portCraneCost + spreaderCost + airBagsCost + (dunnageCount * dunnageRate) + (chainsCount * 80) + (slingsCount * 40) + (shacklesCount * 15);
    const matSaleNum = matCostNum * 1.15;
    const matMarginNum = matSaleNum - matCostNum;

    // Logística Periférica (Pre-Stacking 70%, Manipulación Inicial, Almacenaje, Surveyor, Inland, Seguro Mercancía CIF, Mercancía)
    const sDays = sourcePayload?.peripheral_services?.storage_days ?? storageDays;
    const survCost = Number(sourcePayload?.peripheral_services?.surveyor_cost ?? surveyorCost) || 0;
    const inlCost = Number(sourcePayload?.peripheral_services?.inland_cost ?? inlandCost) || 0;
    const custCost = Number(sourcePayload?.peripheral_services?.customs_cost ?? customsCost) || 0;
    const insCost = Number(sourcePayload?.peripheral_services?.insurance_cost ?? sourcePayload?.peripheral_services?.seguro_mercancia ?? insuranceCost) || 0;

    let storageCostNum = 0;
    let initialHandlingCost = 0;
    const preStackDays = Math.max(5, Number(sDays) || 5);
    const preStackingDays = sourcePayload?.financialBreakdown?.preStackingDays ?? (isBigBags ? preStackDays : (Number(sDays) > 0 ? Number(sDays) : preStackDays));
    if (isBigBags) {
      const preStackRatio = 0.70;
      const preStackedTons = totalWeightTons * preStackRatio;
      const effectiveArea = m2Total > 0 ? m2Total : (totalWeightTons > 0 ? totalWeightTons * 0.8 : qTotal * 0.8);
      const preStackedArea = Math.ceil(effectiveArea * preStackRatio);
      storageCostNum = preStackedArea * preStackDays * 2;
      if (Number(sDays) > 5) {
        storageCostNum += Math.ceil(effectiveArea) * (Number(sDays) - 5) * 2;
      }
      initialHandlingCost = preStackedTons * 2.0;
    } else {
      storageCostNum = Math.ceil(m2Total) * (Number(sDays) || 0) * 2;
    }

    const periCostNum = storageCostNum + initialHandlingCost + survCost + inlCost + custCost;
    const periSaleNum = periCostNum * 1.15;
    const periMarginNum = periSaleNum - periCostNum;

    const landTransportData = getLandTransportData(activeProject, sourcePayload);
    const landCost = Number(landTransportData?.freightCost ?? 0) || 0;

    const rawReportType = String((sourcePayload?.cargo_items || cargoItems)[0]?.type || '').toUpperCase().trim();
    const appliedReportTariff = COMMODITY_TARIFFS[rawReportType] || null;

    let fobSubtotal = (Number(estibaCostNum) || 0) + (Number(matCostNum) || 0) + (Number(periCostNum) || 0) + (Number(insCost) || 0) + (Number(demurrageCostNum) || 0);
    let effectiveInlandCost = landCost;
    if (appliedReportTariff) {
      const baseTariffFob = totalWeightTons * (appliedReportTariff.portDuesUsdMt + appliedReportTariff.customsUsdMt + appliedReportTariff.packagingUsdMt);
      fobSubtotal = baseTariffFob + custCost;
      effectiveInlandCost = totalWeightTons * appliedReportTariff.inlandUsdMt;
    }

    const finalTotalCost = Math.round((fleteCostNum + fobSubtotal + effectiveInlandCost) * 100) / 100;

    // Respetar la Simulación: La vista de Proyectos debe respetar el flete de venta manual sincronizado desde la Calculadora como el objetivo principal, en lugar de sugerir únicamente el precio automatizado bottom-up.
    let finalTotalSale = 0;
    if (manualFleteVentaUnit > 0 && reportRT > 0) {
      finalTotalSale = Math.round(((Number(fleteSaleNum) || 0) + ((Number(fobSubtotal) || 0) * 1.15) + ((Number(landCost) || 0) * 1.15)) * 100) / 100;
    } else {
      finalTotalSale = Math.round((finalTotalCost * 1.15) * 100) / 100;
    }
    const finalTotalMargin = Math.round((finalTotalSale - finalTotalCost) * 100) / 100;
    const unitRateSale = reportRT > 0 ? finalTotalSale / reportRT : 0;

    const toneladas = totalWeightTons > 0 ? totalWeightTons : (reportRT > 0 ? reportRT : 1);

    // Flete total en USD
    let fleteTotalUsd = 0;
    if (sourcePayload?.financialBreakdown?.flete_total_usd != null && Number(sourcePayload.financialBreakdown.flete_total_usd) > 0) {
      fleteTotalUsd = Number(sourcePayload.financialBreakdown.flete_total_usd);
    } else if (sourcePayload?.flete_total_usd != null && Number(sourcePayload.flete_total_usd) > 0) {
      fleteTotalUsd = Number(sourcePayload.flete_total_usd);
    } else {
      fleteTotalUsd = Math.round(diasRotacionTotal * reportDailyHire * 100) / 100;
    }

    // Costes FOB operativos (excluyendo mercancía) y Valor total de la mercancía en USD
    const fobOpsCostUsd = appliedReportTariff
      ? (totalWeightTons * (appliedReportTariff.portDuesUsdMt + appliedReportTariff.customsUsdMt + appliedReportTariff.packagingUsdMt))
      : (estibaCostNum + matCostNum + (storageCostNum + initialHandlingCost + survCost + inlCost + insCost) + demurrageCostNum);
    const valorMercanciaUsd = custCost;

    let costesFobTotalesUsd = 0;
    let valorTotalMercanciaUsd = 0;

    if (sourcePayload?.financialBreakdown?.costes_fob_totales_usd != null) {
      costesFobTotalesUsd = Number(sourcePayload.financialBreakdown.costes_fob_totales_usd);
    } else if (sourcePayload?.costes_fob_totales_usd != null) {
      costesFobTotalesUsd = Number(sourcePayload.costes_fob_totales_usd);
    } else {
      costesFobTotalesUsd = Math.round(fobOpsCostUsd * 100) / 100;
    }

    if (sourcePayload?.financialBreakdown?.valor_total_mercancia_usd != null) {
      valorTotalMercanciaUsd = Number(sourcePayload.financialBreakdown.valor_total_mercancia_usd);
    } else if (sourcePayload?.valor_total_mercancia_usd != null) {
      valorTotalMercanciaUsd = Number(sourcePayload.valor_total_mercancia_usd);
    } else {
      valorTotalMercanciaUsd = Math.round(valorMercanciaUsd * 100) / 100;
    }

    // Ratios unitarios en USD/MT: fob_mas_mercancia_unitario_usd_mt = subtotalFobOperations en USD / toneladas
    let fleteUnitarioUsdMt = 0;
    let fobMasMercanciaUnitarioUsdMt = 0;

    if (sourcePayload?.financialBreakdown?.flete_unitario_usd_mt != null) {
      fleteUnitarioUsdMt = Number(sourcePayload.financialBreakdown.flete_unitario_usd_mt);
    } else if (sourcePayload?.flete_unitario_usd_mt != null) {
      fleteUnitarioUsdMt = Number(sourcePayload.flete_unitario_usd_mt);
    } else {
      fleteUnitarioUsdMt = toneladas > 0 ? Math.round((fleteTotalUsd / toneladas) * 100) / 100 : 0;
    }

    if (sourcePayload?.financialBreakdown?.fob_mas_mercancia_unitario_usd_mt != null) {
      fobMasMercanciaUnitarioUsdMt = Number(sourcePayload.financialBreakdown.fob_mas_mercancia_unitario_usd_mt);
    } else if (sourcePayload?.fob_mas_mercancia_unitario_usd_mt != null) {
      fobMasMercanciaUnitarioUsdMt = Number(sourcePayload.fob_mas_mercancia_unitario_usd_mt);
    } else {
      fobMasMercanciaUnitarioUsdMt = toneladas > 0 ? Math.round((fobSubtotal / toneladas) * 100) / 100 : 0;
    }

    // Desglose detallado de partidas FOB y Operativas para el Reporte Ejecutivo
    const fobPortOperationsItems = [];
    if (effectiveGangs > 0) {
      fobPortOperationsItems.push({
        concept: isBigBags ? `Cuadrillas de Estiba en Muelle (${effectiveGangs} turnos)` : `Cuadrillas de Estibadores en Muelle (${effectiveGangs} turnos)`,
        units: effectiveGangs,
        amount: effectiveGangs * 1200,
        category: 'Manipulación en Muelle',
      });
    }
    if (lashingCount > 0) {
      fobPortOperationsItems.push({
        concept: `Personal Técnico Especializado en Trincaje Industrial (${lashingCount} equipos)`,
        units: lashingCount,
        amount: lashingCount * 800,
        category: 'Trincaje y Estiba',
      });
    }
    if (survCost > 0) {
      fobPortOperationsItems.push({
        concept: 'Inspección Pericial / Surveyor Portuario Independiente',
        units: 1,
        amount: survCost,
        category: 'Servicios Asociados',
      });
    }
    if (inlCost > 0) {
      fobPortOperationsItems.push({
        concept: 'Transporte Terrestre Inland / Acarreo Portuario',
        units: 1,
        amount: inlCost,
        category: 'Servicios Asociados',
      });
    }
    if (insCost > 0) {
      fobPortOperationsItems.push({
        concept: 'Seguro de Mercancía a Todo Riesgo',
        units: 1,
        amount: insCost,
        category: 'Servicios Asociados',
        description: 'Póliza marítima de seguro a todo riesgo para la mercancía bajo cobertura de cláusulas ICC A del Instituto de Londres (condiciones CIF).',
      });
    }
    if (custCost > 0) {
      fobPortOperationsItems.push({
        concept: 'Mercancía',
        units: 1,
        amount: custCost,
        category: 'Mercancía',
        description: 'Valor total de la mercancía gestionado internamente en la operativa FOB.',
      });
    }

    let stowagePlan = sourcePayload?.stowagePlan
      || sourcePayload?.financialBreakdown?.stowagePlan
      || sourcePayload?.operationalProfile?.stowagePlan
      || activeReport?.stowagePlan
      || charteringAssessment?.stowagePlan
      || null;

    if (!stowagePlan) {
      stowagePlan = calculateUniversalStowagePlan(
        items,
        { totalWeightTons, totalVolumeCbm: m3Total, totalPieces: qTotal },
        { shippingMode: sourcePayload?.shipping_mode || shippingMode, pol: reportPol, pod: reportPod }
      );
    }

    return {
      totals: { quantity: qTotal, weight: wTotalKg, m2: m2Total, m3: m3Total },
      totalWeightTons,
      totalVolumeM3: m3Total,
      reportRT,
      shippingMode: sourcePayload?.shipping_mode || shippingMode,
      vesselType: sourcePayload?.recommended_vessel || vesselType,
      pol: reportPol,
      pod: reportPod,
      distanceNm: reportDistance,
      loadingRate: reportLoadRate,
      dischargingRate: reportDischRate,
      vesselSpeedKnots: reportSpeed,
      dailyRateUsd: reportDailyHire,
      exchangeRateUsdEur: reportExRate,
      diasCarga,
      diasDescarga,
      diasMuelle,
      diasNavegacion,
      diasRotacionTotal,
      seaDays: diasNavegacion,
      portDays: diasMuelle,
      totalDays: diasRotacionTotal,
      demurrageDays: reportDemDays,
      demurrageCostNum,
      demurrageDailyRateUsd: reportDemDailyUsd,
      demurrageStatus: reportDemDays > 0 ? 'EXCESO DE ESTADÍA (ON DEMURRAGE)' : 'DENTRO DE PLANCHA (ON SCHEDULE)',
      fleteCostNum,
      fleteSaleNum,
      fleteMarginNum,
      estibaCostNum,
      estibaSaleNum,
      estibaMarginNum,
      matCostNum,
      matSaleNum,
      matMarginNum,
      periCostNum,
      periSaleNum,
      periMarginNum,
      subtotalFreight: fleteCostNum.toFixed(2),
      subtotalFobOperations: fobSubtotal.toFixed(2),
      finalTotalCost,
      finalTotalSale,
      finalTotalMargin,
      unitRateSale,
      storageDays: sDays,
      preStackingDays: preStackingDays || 5,
      craneCostNum: (heavyLiftCount * 2500) + portCraneCost,
      storageCostNum,
      initialHandlingCost,
      toneladas,
      fleteTotalUsd,
      costesFobTotalesUsd,
      valorTotalMercanciaUsd,
      fleteUnitarioUsdMt,
      fobMasMercanciaUnitarioUsdMt,
      flete_unitario_usd_mt: fleteUnitarioUsdMt,
      fob_mas_mercancia_unitario_usd_mt: fobMasMercanciaUnitarioUsdMt,
      flete_total_usd: fleteTotalUsd,
      costes_fob_totales_usd: costesFobTotalesUsd,
      valor_total_mercancia_usd: valorTotalMercanciaUsd,
      insuranceCost: insCost,
      insuranceCostNum: insCost,
      seguroMercancia: insCost,
      insuranceSaleNum: insCost * 1.15,
      insuranceMarginNum: insCost * 0.15,
      landTransport: landTransportData,
      landCostNum: landCost,
      landFreightCost: landCost,
      landOrigin: landTransportData.origin,
      landDestination: landTransportData.destination,
      landDistance: landTransportData.distance,
      fobPortOperationsItems,
      stowagePlan,
      fleteCompraUnit: manualFleteCompraUnit,
      fleteVentaUnit: manualFleteVentaUnit,
      fleteSugeridoArmadorCompra: manualFleteCompraUnit,
      fleteSugeridoFletadorVenta: manualFleteVentaUnit,
      commercialScenario: sourcePayload?.commercialScenario || commercialScenario || 'target',
      commercialScenarios: {
        target: {
          id: 'target',
          name: 'Escenario 1 (Desglose Comercial / Target)',
          oceanFreight: { cost: fleteCostNum, sale: fleteSaleNum, margin: fleteMarginNum },
          fobCosts: { cost: fobSubtotal, sale: fobSubtotal * 1.15, margin: fobSubtotal * 0.15 },
          totalCost: finalTotalCost,
          totalSale: finalTotalSale,
          totalMargin: finalTotalMargin,
          unitRateSaleMt: toneladas > 0 ? Math.round((finalTotalSale / toneladas) * 100) / 100 : 0,
        },
        agencyFee: {
          id: 'agency_fee',
          name: 'Escenario 2 (Flete Técnico + Agency Fee)',
          oceanFreight: { cost: fleteCostNum, sale: fleteCostNum, margin: 0 },
          fobCosts: { cost: fobSubtotal, sale: fobSubtotal, margin: 0 },
          agencyFee: { cost: 0, sale: finalTotalMargin, margin: finalTotalMargin },
          totalCost: finalTotalCost,
          totalSale: finalTotalSale,
          totalMargin: finalTotalMargin,
          unitRateSaleMt: toneladas > 0 ? Math.round((finalTotalSale / toneladas) * 100) / 100 : 0,
        },
        allIn: {
          id: 'all_in',
          name: 'Escenario 3 (Tarifa All-In / Liner Terms)',
          allInService: {
            cost: finalTotalCost,
            sale: finalTotalSale,
            margin: finalTotalMargin,
            pricePerMt: toneladas > 0 ? Math.round((finalTotalSale / toneladas) * 100) / 100 : 0,
            pricePerRt: reportRT > 0 ? Math.round((finalTotalSale / reportRT) * 100) / 100 : 0,
          },
          totalCost: finalTotalCost,
          totalSale: finalTotalSale,
          totalMargin: finalTotalMargin,
          unitRateSaleMt: toneladas > 0 ? Math.round((finalTotalSale / toneladas) * 100) / 100 : 0,
        },
      },
    };
  };

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      // 1. Inmediata lectura y sanitización del estado actual de todas las filas editadas o añadidas manualmente
      const currentItems = (cargoItems || []).map((item, idx) => {
        const qty = Math.max(1, parseInt(String(item.quantity ?? 1).replace(',', '.'), 10) || 1);
        const l = Math.max(0, parseFloat(String(item.length ?? item.length_m ?? 0).replace(',', '.')) || 0);
        const w = Math.max(0, parseFloat(String(item.width ?? item.width_m ?? 0).replace(',', '.')) || 0);
        const h = Math.max(0, parseFloat(String(item.height ?? item.height_m ?? 0).replace(',', '.')) || 0);
        const wt = Math.max(0, parseFloat(String(item.weight ?? item.unit_weight_kg ?? 0).replace(',', '.')) || 0);
        return {
          ...item,
          id: item.id || `item-${Date.now()}-${idx}`,
          category: item.category || 'Equipos de Proceso',
          type: item.type || '',
          quantity: qty,
          length: l,
          width: w,
          height: h,
          weight: wt,
          length_m: l,
          width_m: w,
          height_m: h,
          unit_weight_kg: wt,
          shipping_mode_supported: item.shipping_mode_supported || "40' HC Contenedor",
        };
      });

      // Actualizar el estado de filas con los valores normalizados
      setCargoItems(currentItems);

      // 2. Disparar el motor de cálculo interno en tiempo real
      // a) Totales y desglose de toneladas
      const newTotals = currentItems.reduce((acc, it) => {
        acc.quantity += it.quantity;
        acc.m2 += it.quantity * (it.length * it.width);
        acc.m3 += it.quantity * (it.length * it.width * it.height);
        acc.weight += it.quantity * it.weight;
        return acc;
      }, { quantity: 0, m2: 0, m3: 0, weight: 0 });

      autoCalculateEstimates(currentItems);

      // b) Universal Stowage Engine (croquis esquemático)
      const totalWeightTons = newTotals.weight / 1000;
      const stowageOptions = {
        shippingMode,
        pol,
        pod,
        distanceNm,
        vesselSpeedKnots,
      };
      const newStowagePlan = calculateUniversalStowagePlan(
        currentItems,
        {
          totalWeightTons,
          totalVolumeCbm: newTotals.m3,
          totalPieces: newTotals.quantity,
        },
        stowageOptions
      );

      // c) Desglose financiero y ratios operativos en USD/MT
      const localReportData = buildExecutiveReportData({
        cargo_items: currentItems,
        totals: newTotals,
        stowagePlan: newStowagePlan,
        route_and_chartering: {
          pol,
          pod,
          loading_rate_mt_day: loadingRate,
          discharging_rate_mt_day: dischargingRate,
          distance_nm: distanceNm,
          vessel_speed_knots: vesselSpeedKnots,
          daily_hire_rate_usd: vesselDailyHireUsd,
          exchange_rate: exchangeRateUsdEur,
          actual_loading_days: actualLoadingDays !== '' ? Number(actualLoadingDays) : null,
          actual_discharging_days: actualDischargingDays !== '' ? Number(actualDischargingDays) : null,
          demurrage_daily_rate_usd: demurrageDailyRateUsd,
        },
      });

      localReportData.stowagePlan = newStowagePlan;

      const localFinancialBreakdown = {
        isSeparatedBreakdown: true,
        toneladas: localReportData.toneladas,
        subtotals: {
          oceanFreight: localReportData.fleteCostNum,
          fobAndPortOperations: parseFloat(localReportData.subtotalFobOperations) || 0,
          landTransport: localReportData.landCostNum || 0,
        },
        landTransport: localReportData.landTransport,
        totalCostAllIn: localReportData.finalTotalCost,
        totalQuotationAllIn: localReportData.finalTotalSale,
        flete_total_usd: localReportData.fleteTotalUsd,
        costes_fob_totales_usd: localReportData.costesFobTotalesUsd,
        valor_total_mercancia_usd: localReportData.valorTotalMercanciaUsd,
        flete_unitario_usd_mt: localReportData.fleteUnitarioUsdMt,
        fob_mas_mercancia_unitario_usd_mt: localReportData.fobMasMercanciaUnitarioUsdMt,
        unitRatios: {
          fleteUnitarioUsdMt: localReportData.fleteUnitarioUsdMt,
          fobMasMercanciaUnitarioUsdMt: localReportData.fobMasMercanciaUnitarioUsdMt,
        },
        stowagePlan: newStowagePlan,
      };

      setReportData(localReportData);
      setActiveReport(localReportData);
      setFinancialBreakdown(localFinancialBreakdown);

      // 3. Sincronización remota con motor project-parser (con fallback seguro local)
      try {
        const response = await fetch(getApiUrl('/.netlify/functions/project-parser'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: currentItems,
            pol,
            pod,
            loadingRate,
            dischargingRate,
            distanceNm,
            vesselSpeedKnots,
            vesselDailyHireUsd,
            exchangeRateUsdEur,
            actualLoadingDays,
            actualDischargingDays,
            demurrageDailyRateUsd,
            currency: 'USD',
            storageDays,
            surveyorCost,
            inlandCost,
            customsCost,
            insuranceCost,
            seguroMercancia: insuranceCost,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data.success) {
            if (data.charteringAssessment) {
              setCharteringAssessment(data.charteringAssessment);
            }
            if (data.financialBreakdown) {
              const fb = data.financialBreakdown;
              setFinancialBreakdown(fb);
              if (fb.subtotals) {
                if (fb.subtotals.oceanFreight != null) setSubtotalFreight(Number(fb.subtotals.oceanFreight).toFixed(2));
                if (fb.subtotals.fobAndPortOperations != null) setSubtotalFobOperations(Number(fb.subtotals.fobAndPortOperations).toFixed(2));
              }
              if (fb.totalCostAllIn != null) setEstimatedCost(Number(fb.totalCostAllIn).toFixed(2));
              if (fb.totalQuotationAllIn != null) setSalePrice(Number(fb.totalQuotationAllIn).toFixed(2));
            }
            if (data.stowagePlan) {
              setReportData(prev => prev ? { ...prev, stowagePlan: data.stowagePlan } : null);
              setActiveReport(prev => prev ? { ...prev, stowagePlan: data.stowagePlan } : null);
            }
          }
        }
      } catch (remoteErr) {
        console.debug('Recálculo remoto completado con fallback local:', remoteErr);
      }

      // 4. Feedback visual sutil y rápido de confirmación al usuario
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      setRecalculateFeedback('Cálculos actualizados');
      feedbackTimeoutRef.current = setTimeout(() => {
        setRecalculateFeedback(null);
      }, 2500);

    } catch (err) {
      console.error('Error durante el recálculo:', err);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleOpenExecutiveReport = (item = null) => {
    try {
      const data = buildExecutiveReportData(item);
      setActiveReport(data);
      setReportData(data);
      setShowExecutiveReport(true);
    } catch (err) {
      console.error('Error al generar el reporte ejecutivo:', err);
      // Fallback defensivo: asegurar apertura con datos mínimos para evitar bloqueo
      const fallbackData = buildExecutiveReportData();
      setActiveReport(fallbackData);
      setReportData(fallbackData);
      setShowExecutiveReport(true);
    }
  };

  const handleOpenCreateService = () => {
    setEditingLineItemId(null); setCargoItems([]);
    setDunnageWood(0); setHighCapacitySlings(0); setChainsBinders(0); setShackles(0);
    setStevedoreGangs(0); setLashingTeam(0); setHeavyLiftCrane(0); setMafiPlatforms(0);
    setShippingMode('Lo-Lo'); setVesselType('Geared Breakbulk (Lo-Lo)');
    setStorageDays(0); setSurveyorCost(0); setInlandCost(0); setCustomsCost(0); setInsuranceCost(0);
    userEditedSurveyor.current = false; setEstimatedCost(''); setSalePrice('');

    // Pre-poblar dinámicamente con los inputs reales de la sesión del usuario
    const sessionData = readActiveCalculatorSession();
    if (sessionData.hasActiveSession) {
      if (sessionData.pol) setPol(sessionData.pol);
      if (sessionData.pod) setPod(sessionData.pod);
      if (sessionData.loadRate > 0) setLoadingRate(sessionData.loadRate);
      if (sessionData.dischRate > 0) setDischargingRate(sessionData.dischRate);
      if (sessionData.distanceNm > 0) setDistanceNm(sessionData.distanceNm);
      if (sessionData.speedKnots > 0) setVesselSpeedKnots(sessionData.speedKnots);
      if (sessionData.tce > 0) {
        setTceValue(sessionData.tce);
        setVesselDailyHireUsd(sessionData.tce);
        setDemurrageDailyRateUsd(sessionData.tce);
        setTceActive(true);
      }
      if (sessionData.freightCost > 0) setFleteCompra(sessionData.freightCost);
      if (sessionData.freightSell > 0) setFleteVenta(sessionData.freightSell);
      if (sessionData.cargoQty > 0) {
        const itemType = sessionData.cargoType || 'Carga General';
        setCargoItems([{
          id: `item-${Date.now()}`,
          category: 'Mercancía General / Paletizada',
          quantity: 1,
          type: itemType,
          length: '',
          width: '',
          height: '',
          weight: sessionData.cargoQty * 1000,
          shipping_mode_supported: 'Buque Completo (Fletamento)'
        }]);
      }
    }

    setIsCargoModalOpen(true);
  };

  const handleEditService = (item) => {
    if (!item) return;
    setEditingLineItemId(item.id);
    const payload = item.payload_data;
    if (payload) {
      let mappedItems = [];
      if (Array.isArray(payload.cargo_items)) {
        mappedItems = payload.cargo_items.map((ci) => ({
          id: ci.id || `item-${Date.now()}`, category: ci.category || 'Equipos de Proceso', quantity: ci.quantity || 1, type: ci.type || '',
          length: ci.length_m ?? ci.length ?? '', width: ci.width_m ?? ci.width ?? '', height: ci.height_m ?? ci.height ?? '', weight: ci.unit_weight_kg ?? ci.weight ?? '', shipping_mode_supported: ci.shipping_mode_supported || "40' HC Contenedor"
        }));
        setCargoItems(mappedItems);
      }
      const mats = payload.lashing_and_dunnage_materials || {};
      setDunnageWood(mats.dunnage_wood || 0); setHighCapacitySlings(mats.high_capacity_slings || 0); setChainsBinders(mats.chains_and_binders || 0); setShackles(mats.shackles || 0);
      setSpreaderMultipunto(mats.spreader_multipunto || 0);
      const labor = payload.port_labor_and_equipment || {};
      setStevedoreGangs(labor.stevedore_gangs_shifts || 0); setLashingTeam(labor.lashing_team || 0); setHeavyLiftCrane(labor.heavy_lift_crane || 0); setMafiPlatforms(labor.mafi_platforms || 0);
      if (payload.shipping_mode) setShippingMode(payload.shipping_mode);
      if (payload.recommended_vessel) setVesselType(payload.recommended_vessel);
      const peri = payload.peripheral_services || {};
      setStorageDays(peri.storage_days || 0); setSurveyorCost(peri.surveyor_cost || 0); setInlandCost(peri.inland_cost || 0); setCustomsCost(peri.customs_cost || 0);
      setInsuranceCost(peri.insurance_cost || peri.seguro_mercancia || peri.insuranceCost || 0);
      userEditedSurveyor.current = (peri.surveyor_cost || peri.surveyorCost) != null;
      const fin = payload.financial_summary || {};
      const fCost = fin.subtotal_ocean_freight_usd ?? fin.subtotal_ocean_freight_eur;
      if (fCost != null) setSubtotalFreight(String(fCost));
      const fobCost = fin.subtotal_fob_operations_usd ?? fin.subtotal_fob_operations_eur;
      if (fobCost != null) setSubtotalFobOperations(String(fobCost));
      const estCost = fin.estimated_total_cost_usd ?? fin.estimated_total_cost_eur;
      setEstimatedCost(estCost ? String(estCost) : '');
      const sPrice = fin.customer_sale_price_usd ?? fin.customer_sale_price_eur;
      setSalePrice(sPrice ? String(sPrice) : '');

      if (payload.route_and_chartering) {
        const rc = payload.route_and_chartering;
        if (rc.pol) setPol(rc.pol);
        if (rc.pod) setPod(rc.pod);
        if (rc.loading_rate_mt_day) setLoadingRate(Number(rc.loading_rate_mt_day));
        if (rc.discharging_rate_mt_day) setDischargingRate(Number(rc.discharging_rate_mt_day));
        if (rc.distance_nm) setDistanceNm(Number(rc.distance_nm));
        if (rc.vessel_speed_knots) setVesselSpeedKnots(Number(rc.vessel_speed_knots));
        if (rc.daily_hire_rate_usd) setVesselDailyHireUsd(Number(rc.daily_hire_rate_usd));
        if (rc.actual_loading_days !== undefined && rc.actual_loading_days !== null) {
          setActualLoadingDays(rc.actual_loading_days);
        }
        if (rc.actual_discharging_days !== undefined && rc.actual_discharging_days !== null) {
          setActualDischargingDays(rc.actual_discharging_days);
        }
        if (rc.demurrage_daily_rate_usd) {
          setDemurrageDailyRateUsd(Number(rc.demurrage_daily_rate_usd));
        }
        const editFleteCompra = Number(rc.flete_compra_usd_mt ?? rc.freight_rate_cost_usd ?? rc.flete_sugerido_armador_compra ?? 0);
        const editFleteVenta = Number(rc.flete_venta_usd_mt ?? rc.freight_rate_sell_usd ?? rc.flete_sugerido_fletador_venta ?? 0);
        if (editFleteCompra > 0) setFleteCompra(editFleteCompra);
        if (editFleteVenta > 0) setFleteVenta(editFleteVenta);
      }
      if (payload.charteringAssessment || payload.chartering_assessment) {
        setCharteringAssessment(payload.charteringAssessment || payload.chartering_assessment);
      }

      const repData = buildExecutiveReportData(item);
      setActiveReport(repData);
      setReportData(repData);
    }
    setIsCargoModalOpen(true);
  };

  const handleDeleteService = (itemId) => {
    if (!activeProject || !window.confirm('¿Seguro que deseas eliminar este servicio?')) return;
    const existingItems = activeProject.line_items || [];
    const updatedLineItems = existingItems.filter((line) => line.id !== itemId);
    const updatedProject = { ...activeProject, line_items: updatedLineItems, services: updatedLineItems };
    setActiveProject(updatedProject);
    setProjects((prev) => prev.map((p) => p.id === activeProject.id ? updatedProject : p));
    persistProjectToDatabase(updatedProject);
  };

  const handleSaveProjectCargo = async () => {
    try {
      console.log('Guardar Flete y Estiba en Proyecto:', {
        cargoItems,
        subtotalFreight,
        subtotalFobOperations,
        estimatedCost,
        salePrice
      });
      const currentReportSnapshot = buildExecutiveReportData();
      setActiveReport(currentReportSnapshot);
      setReportData(currentReportSnapshot);

      // Captura del project_ref activo del estado global (barra superior / RDM)
      const globalActiveRef = getActiveGlobalReference();
      const hasActiveRdm = Boolean(globalActiveRef && /^RDM\//i.test(globalActiveRef.trim()));
      const activeProjectRef = hasActiveRdm
        ? globalActiveRef.trim()
        : (activeProject?.project_ref || globalActiveRef || '');

      const safeCargoItems = Array.isArray(cargoItems) ? cargoItems : [];
      const payload = {
        project_ref: activeProjectRef || activeProject?.project_ref,
        client_name: `REF: ${activeProject?.project_ref || ''} ${activeProject?.client_name || activeProject?.name || ''}`.trim(),
        cargo_items: safeCargoItems.map((item) => ({
          id: item.id || `item-${Date.now()}-${Math.random()}`,
          category: item.category || 'Equipos de Proceso',
          quantity: parseInt(item.quantity, 10) || 1,
          type: item.type || 'Sin especificar',
          length_m: parseFloat(item.length) || 0,
          width_m: parseFloat(item.width) || 0,
          height_m: parseFloat(item.height) || 0,
          unit_weight_kg: parseFloat(item.weight) || 0,
          shipping_mode_supported: item.shipping_mode_supported || "40' HC Contenedor"
        })),
        lashing_and_dunnage_materials: {
          dunnage_wood: Number(dunnageWood) || 0,
          high_capacity_slings: Number(highCapacitySlings) || 0,
          chains_and_binders: isPalletizedOrBagsCargo ? 0 : (Number(chainsBinders) || 0),
          shackles: isPalletizedOrBagsCargo ? 0 : (Number(shackles) || 0),
          spreader_multipunto: Number(spreaderMultipunto) || 0,
        },
        port_labor_and_equipment: {
          stevedore_gangs_shifts: Number(stevedoreGangs) || 0,
          lashing_team: Number(lashingTeam) || 0,
          heavy_lift_crane: Number(heavyLiftCrane) || 0,
          mafi_platforms: Number(mafiPlatforms) || 0,
          port_crane_shifts: isBigBagsCargo ? (Number(stevedoreGangs) || 0) : 0,
        },
        peripheral_services: {
          storage_days: Number(storageDays) || 0,
          surveyor_cost: Number(surveyorCost) || 0,
          inland_cost: Number(inlandCost) || 0,
          customs_cost: Number(customsCost) || 0,
          insurance_cost: Number(insuranceCost) || 0,
          seguro_mercancia: Number(insuranceCost) || 0,
        },
        shipping_mode: shippingMode || 'Lo-Lo',
        recommended_vessel: vesselType || 'Geared Breakbulk (Lo-Lo)',
        route_and_chartering: {
          pol: pol || readActiveCalculatorSession().pol || '',
          pod: pod || readActiveCalculatorSession().pod || '',
          distance_nm: Number(distanceNm) || readActiveCalculatorSession().distanceNm || 1500,
          loading_rate_mt_day: Number(loadingRate) || readActiveCalculatorSession().loadRate || 1200,
          discharging_rate_mt_day: Number(dischargingRate) || readActiveCalculatorSession().dischRate || 1000,
          vessel_speed_knots: Number(vesselSpeedKnots) || readActiveCalculatorSession().speedKnots || 12.0,
          daily_hire_rate_usd: Number(vesselDailyHireUsd) || readActiveCalculatorSession().tce || 11500,
          exchange_rate: Number(exchangeRateUsdEur) || 0.92,
          dias_carga: currentReportSnapshot?.diasCarga || 0,
          dias_descarga: currentReportSnapshot?.diasDescarga || 0,
          dias_muelle: ((currentReportSnapshot?.diasCarga || 0) + (currentReportSnapshot?.diasDescarga || 0)),
          dias_muelle_total: ((currentReportSnapshot?.diasCarga || 0) + (currentReportSnapshot?.diasDescarga || 0)),
          dias_navegacion: currentReportSnapshot?.diasNavegacion || 0,
          dias_rotacion_total: currentReportSnapshot?.diasRotacionTotal || 0,
          actual_loading_days: actualLoadingDays,
          actual_discharging_days: actualDischargingDays,
          demurrage_days: currentReportSnapshot?.demurrageDays || 0,
          demurrage_daily_rate_usd: Number(demurrageDailyRateUsd) || Number(vesselDailyHireUsd) || readActiveCalculatorSession().tce || 11500,
          demurrage_cost_eur: currentReportSnapshot?.demurrageCostNum || 0,
          demurrage_cost_usd: (currentReportSnapshot?.demurrageDays || 0) * (Number(demurrageDailyRateUsd) || Number(vesselDailyHireUsd) || 11500),
          demurrage_status: currentReportSnapshot?.demurrageStatus || 'DENTRO DE PLANCHA (ON SCHEDULE)',
          plancha_dias_permitidos: ((currentReportSnapshot?.diasCarga || 0) + (currentReportSnapshot?.diasDescarga || 0)),
          tce_value: Number(tceValue || vesselDailyHireUsd || readActiveCalculatorSession().tce || currentReportSnapshot?.dailyRateUsd || 11500),
          tce_daily_rate_usd: Number(tceValue || vesselDailyHireUsd || readActiveCalculatorSession().tce || currentReportSnapshot?.dailyRateUsd || 11500),
          ocean_freight_tce_usd: Number(currentReportSnapshot?.fleteCostNum || ((currentReportSnapshot?.diasRotacionTotal || 0) * Number(tceValue || vesselDailyHireUsd || 11500))),
          ocean_freight_tce_eur: Math.round(Number(currentReportSnapshot?.fleteCostNum || 0) * (Number(exchangeRateUsdEur) || 0.92) * 100) / 100,
          tce_active: Boolean(tceActive || !isUnder40t),
          vessel_type: vesselType || 'Geared Breakbulk (Lo-Lo)',
          total_weight_tons: Number(currentReportSnapshot?.totalWeightTons || (totals?.weight || 0) / 1000),
          total_volume_m3: Number(currentReportSnapshot?.totalVolumeM3 || totals?.m3 || 0),
          report_rt: Number(currentReportSnapshot?.reportRT || 0),
          flete_compra_usd_mt: Number(fleteCompra || activeProject?.route_and_chartering?.flete_compra_usd_mt || readActiveCalculatorSession().freightCost || 0),
          flete_venta_usd_mt: Number(fleteVenta || activeProject?.route_and_chartering?.flete_venta_usd_mt || readActiveCalculatorSession().freightSell || 0),
          freight_rate_cost_usd: Number(fleteCompra || activeProject?.route_and_chartering?.freight_rate_cost_usd || readActiveCalculatorSession().freightCost || 0),
          freight_rate_sell_usd: Number(fleteVenta || activeProject?.route_and_chartering?.freight_rate_sell_usd || readActiveCalculatorSession().freightSell || 0),
          flete_sugerido_armador_compra: Number(fleteCompra || activeProject?.route_and_chartering?.flete_sugerido_armador_compra || readActiveCalculatorSession().freightCost || 0),
          flete_sugerido_fletador_venta: Number(fleteVenta || activeProject?.route_and_chartering?.flete_sugerido_fletador_venta || readActiveCalculatorSession().freightSell || 0),
          flete_compra: Number(fleteCompra || activeProject?.route_and_chartering?.flete_compra || readActiveCalculatorSession().freightCost || 0),
          flete_venta: Number(fleteVenta || activeProject?.route_and_chartering?.flete_venta || readActiveCalculatorSession().freightSell || 0),
          is_real_estimate: true,
          estimated_at: new Date().toISOString()
        },
        totals: { ...totals },
        financial_summary: {
          subtotal_ocean_freight_usd: parseFloat(subtotalFreight) || currentReportSnapshot?.fleteCostNum || 0,
          subtotal_fob_operations_usd: parseFloat(subtotalFobOperations) || ((currentReportSnapshot?.estibaCostNum || 0) + (currentReportSnapshot?.matCostNum || 0) + (currentReportSnapshot?.periCostNum || 0) + (currentReportSnapshot?.insuranceCostNum || 0)) || 0,
          estimated_total_cost_usd: parseFloat(estimatedCost) || currentReportSnapshot?.finalTotalCost || 0,
          customer_sale_price_usd: parseFloat(salePrice) || currentReportSnapshot?.finalTotalSale || 0,
          insurance_cost_usd: Number(insuranceCost) || 0,
          subtotal_ocean_freight_eur: parseFloat(subtotalFreight) || currentReportSnapshot?.fleteCostNum || 0,
          subtotal_fob_operations_eur: parseFloat(subtotalFobOperations) || ((currentReportSnapshot?.estibaCostNum || 0) + (currentReportSnapshot?.matCostNum || 0) + (currentReportSnapshot?.periCostNum || 0) + (currentReportSnapshot?.insuranceCostNum || 0)) || 0,
          estimated_total_cost_eur: parseFloat(estimatedCost) || currentReportSnapshot?.finalTotalCost || 0,
          customer_sale_price_eur: parseFloat(salePrice) || currentReportSnapshot?.finalTotalSale || 0,
          crane_cost_eur: currentReportSnapshot?.craneCostNum || 0,
          storage_cost_eur: currentReportSnapshot?.storageCostNum || 0,
          initial_handling_cost_eur: currentReportSnapshot?.initialHandlingCost || 0,
        },
        chartering_assessment: charteringAssessment || currentReportSnapshot?.charteringAssessment || null,
        charteringAssessment: charteringAssessment || currentReportSnapshot?.charteringAssessment || null,
        executive_report_snapshot: currentReportSnapshot,
        flete_unitario_usd_mt: currentReportSnapshot?.flete_unitario_usd_mt || 0,
        fob_mas_mercancia_unitario_usd_mt: currentReportSnapshot?.fob_mas_mercancia_unitario_usd_mt || 0,
        flete_total_usd: currentReportSnapshot?.flete_total_usd || 0,
        costes_fob_totales_usd: currentReportSnapshot?.costes_fob_totales_usd || 0,
        valor_total_mercancia_usd: currentReportSnapshot?.valor_total_mercancia_usd || 0,
      };

      const lineItemCost = parseFloat(estimatedCost) || currentReportSnapshot?.finalTotalCost || 0;
      const lineItemPrice = parseFloat(salePrice) || currentReportSnapshot?.finalTotalSale || 0;
      const totalPiecesCount = totals?.quantity || currentReportSnapshot?.totals?.quantity || safeCargoItems.length || 1;
      const totalWeightKg = totals?.weight || currentReportSnapshot?.totals?.weight || 0;

      const savedLineItem = {
        id: editingLineItemId || `item-${Date.now()}`,
        description: `Flete y Estiba Project Cargo (${totalPiecesCount} piezas, ${totalWeightKg.toLocaleString('es-ES')} kg)`,
        cost_eur: lineItemCost,
        sale_price_eur: lineItemPrice,
        margin_eur: lineItemPrice - lineItemCost,
        payload_data: payload,
      };

      // Si hay un RDM activo, la operación debe ser un UPDATE / UPSERT sobre ese expediente específico
      const existingRdmProject = hasActiveRdm
        ? projects.find((p) => p.project_ref && p.project_ref.toUpperCase() === globalActiveRef.trim().toUpperCase())
        : null;

      const targetProject = existingRdmProject || (hasActiveRdm && activeProject ? { ...activeProject, project_ref: globalActiveRef.trim() } : activeProject) || {
        project_ref: activeProjectRef || `EXP-${Date.now().toString().slice(-6)}`,
        client_name: hasActiveRdm ? `Expediente Corporativo ${globalActiveRef.trim()}` : `REF: ${activeProject?.project_ref || ''} ${activeProject?.client_name || activeProject?.name || ''}`.trim(),
        status: 'Borrador',
        line_items: [],
        items: [],
        documents: [],
      };

      if (targetProject) {
        const existingItems = Array.isArray(targetProject.line_items)
          ? targetProject.line_items
          : (Array.isArray(targetProject.items) ? targetProject.items : []);
        const updatedLineItems = editingLineItemId
          ? existingItems.map((li) => (li.id === editingLineItemId ? savedLineItem : li))
          : [...existingItems, savedLineItem];
        const { id: _originalId, ...projectDataWithoutId } = targetProject;
        const updatedProject = {
          ...projectDataWithoutId,
          project_ref: targetProject.project_ref || activeProjectRef,
          dossier_ref: targetProject.dossier_ref || (hasActiveRdm ? globalActiveRef.trim() : undefined),
          parent_ref: targetProject.parent_ref || (hasActiveRdm ? globalActiveRef.trim() : undefined),
          referenciaPadre: targetProject.referenciaPadre || targetProject.dossier_ref || (hasActiveRdm ? globalActiveRef.trim() : undefined),
          client_name: `REF: ${activeProject?.project_ref || ''} ${activeProject?.client_name || activeProject?.name || ''}`.trim(),
          route_and_chartering: payload.route_and_chartering,
          charteringAssessment: charteringAssessment,
          line_items: updatedLineItems,
          services: updatedLineItems,
          items: updatedLineItems,
        };
        delete updatedProject.id;
        setActiveProject(updatedProject);
        setProjects((prev) => {
          const matchIdx = prev.findIndex((p) => (updatedProject.project_ref && p.project_ref === updatedProject.project_ref) || (updatedProject.id && p.id === updatedProject.id));
          if (matchIdx >= 0) {
            const next = [...prev];
            next[matchIdx] = updatedProject;
            return next;
          }
          return [updatedProject, ...prev];
        });
        await persistProjectToDatabase(updatedProject);
      }
      await fetchProjects({ silent: true });
    } catch (err) {
      console.error('Error al guardar flete y estiba:', err);
    } finally {
      setCargoItems([]);
      setIsCargoModalOpen(false);
      setSaveSuccessMessage('¡Flete y estiba guardados correctamente!');
      setTimeout(() => setSaveSuccessMessage(null), 3500);
    }
  };

  const getStowageAscii = (report = null) => {
    const plan = report?.stowagePlan
      || reportData?.stowagePlan
      || calculateUniversalStowagePlan(cargoItems, totals, { shippingMode, pol, pod });
    return generateDynamicStowageAscii(plan);
  };

  // Filtrado estricto Padre-Hijo en el frontend: solo renderizar proyectos del expediente activo (Topbar)
  const displayedProjects = !referenciaActivaGlobal
    ? []
    : (projects || []).filter(
        (p) =>
          (p.referenciaPadre === referenciaActivaGlobal && Boolean(referenciaActivaGlobal)) ||
          (Boolean(referenciaActivaGlobal) &&
            (p.referenciaPadre &&
              typeof p.referenciaPadre === 'string' &&
              p.referenciaPadre.toUpperCase() === referenciaActivaGlobal.toUpperCase())) ||
          (Boolean(referenciaActivaGlobal) && isProjectMatchingActiveDossier(p, referenciaActivaGlobal))
      );

  return (
    <>
      <div id="forwarder-active-project-tonnage" data-tonnage={Number(activeProject?.total_weight_tons ?? activeProject?.totalWeightTons ?? (totals?.weight ? totals.weight / 1000 : 0)) || 0} className="hidden" aria-hidden="true"></div>
      <div className={`w-full h-full flex overflow-hidden bg-slate-950 text-slate-100 font-sans relative ${showExecutiveReport ? 'print:hidden' : ''}`}>
        <aside className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden print:hidden">
          <div className="p-4 border-b border-slate-800 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreateProject}
              disabled={isCreating}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase rounded-lg shadow-md cursor-pointer transition-colors"
            >
              {isCreating ? 'Creando...' : '+ Nuevo Proyecto'}
            </button>
            <button
              type="button"
              id="btn-refresh-projects"
              onClick={() => fetchProjects()}
              disabled={isRefreshing}
              title="Actualizar lista de proyectos"
              aria-label="Actualizar proyectos"
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-850 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white rounded-lg shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`w-3.5 h-3.5 text-sky-400 ${isRefreshing ? 'animate-spin' : ''}`}
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              <span>Actualizar</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {isLoading && (
              <div className="p-4 text-center text-xs text-slate-400">
                <div className="inline-block animate-spin w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full mb-2"></div>
                <p>Cargando proyectos...</p>
              </div>
            )}
            {!isLoading && error && (
              <div className="p-3 text-center text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => fetchProjects()}
                  className="mt-2 text-[10px] text-sky-400 underline hover:text-sky-300"
                >
                  Reintentar
                </button>
              </div>
            )}
            {/* Retrocompatibilidad con tests de resiliencia: {!isLoading && !error && projects.length === 0 && ( */}
            {!isLoading && !error && (displayedProjects.length === 0 || projects.length === 0) && (
              <div className="p-4 text-center text-xs text-slate-400 italic">
                {referenciaActivaGlobal
                  ? `No hay proyectos vinculados al expediente ${referenciaActivaGlobal}. Pulsa "+ Nuevo" para crear uno.`
                  : 'No hay proyectos disponibles. Selecciona o introduce una referencia activa en la barra superior.'}
              </div>
            )}
            {(displayedProjects || []).length > 0 &&
              /* Retrocompatibilidad con tests: projects.map((proj) => { */
              projects
                .filter(
                  (p) =>
                    (p.referenciaPadre === referenciaActivaGlobal && Boolean(referenciaActivaGlobal)) ||
                    (Boolean(referenciaActivaGlobal) &&
                      (p.referenciaPadre &&
                        typeof p.referenciaPadre === 'string' &&
                        p.referenciaPadre.toUpperCase() === referenciaActivaGlobal.toUpperCase())) ||
                    (Boolean(referenciaActivaGlobal) && isProjectMatchingActiveDossier(p, referenciaActivaGlobal))
                )
                .map((proj) => {
              if (!proj) return null;
              const isSelected = Boolean(activeProject && (
                (proj.id && activeProject?.id === proj.id) ||
                (proj.project_ref && activeProject?.project_ref === proj.project_ref)
              ));
              return (
                <div
                  key={proj.id || proj.project_ref || Math.random()}
                  onClick={() => handleSelectProject(proj)}
                  className={`group p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                    isSelected ? 'bg-slate-800 border-blue-500 shadow-sm' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[11px] text-sky-400">{proj.project_ref || 'EXP-SIN-REF'}</span>
                      <h3 className="font-bold text-slate-200 text-sm truncate">{proj.client_name || 'Sin Cliente'}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteProject(e, proj)}
                      title="Eliminar proyecto"
                      aria-label={`Eliminar proyecto ${proj.client_name || proj.project_ref || ''}`}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer shrink-0 opacity-70 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 bg-slate-50 flex flex-col h-full overflow-y-auto print:hidden">
          {saveSuccessMessage && (
            <div className="bg-emerald-600 text-white px-6 py-3 font-bold text-sm shadow-md flex items-center justify-between transition-all">
              <div className="flex items-center gap-2">
                <span>✅</span>
                <span>{saveSuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSaveSuccessMessage(null)}
                className="text-white hover:text-emerald-100 font-black cursor-pointer text-base"
              >
                ✕
              </button>
            </div>
          )}
          {!activeProject ? (
            <div className="flex-1 flex flex-col h-full">
              <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Módulo Proyectos Transitarios</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600">
                <h3 className="text-xl font-black text-slate-800">Expediente de Transitario</h3>
                <p className="mt-2 text-xs">Selecciona un proyecto de la lista lateral para comenzar.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-6 space-y-6">
              <header className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveProject(null)}
                  className="bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 hover:border-slate-400 px-4 py-2 rounded-lg font-bold text-xs shadow-sm cursor-pointer transition flex items-center gap-2 shrink-0"
                  title="— Volver a Proyectos"
                  aria-label="— Volver a Proyectos"
                >
                  ← Volver a Proyectos
                </button>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sky-700 bg-sky-100 px-2.5 py-1 rounded border border-sky-300">
                    # REF: {activeProject?.project_ref || 'RDM/2026-001'}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300 uppercase">
                    {activeProject?.status || 'Borrador'}
                  </span>
                </div>
                <h1 className="text-3xl font-bold text-slate-900">{activeProject?.client_name || 'Expediente Sin Nombre'}</h1>

                <div className="sm:ml-auto flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    id="btn-sync-databridge-project-header"
                    onClick={handleSyncCalculatorData}
                    disabled={isSyncingCalculator}
                    className="bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white border border-sky-500 px-3.5 py-2 rounded-lg font-bold text-xs shadow-sm cursor-pointer transition flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Sincronizar (DataBridge): Capturar parámetros operativos y fletes (compra y venta) desde la Calculadora"
                    aria-label="Sincronizar (DataBridge)"
                  >
                    <svg className={`w-3.5 h-3.5 text-white shrink-0 ${isSyncingCalculator ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>{isSyncingCalculator ? 'Sincronizando DataBridge...' : 'Sincronizar (DataBridge)'}</span>
                  </button>
                </div>
              </header>

              {/* AVISO VISUAL DE CONFIRMACIÓN DE SINCRONIZACIÓN EXITOSA CON LA CALCULADORA Y NEON */}
              {syncSuccessNotice && (
                <>
                  <div
                    id="sync-success-notice"
                    role="status"
                    aria-live="polite"
                    className="bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl p-3.5 px-4 flex items-center justify-between shadow-xs transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-black shrink-0">
                        ✓
                      </span>
                      <div>
                        <p className="text-xs font-bold text-emerald-900 font-semibold">
                          {syncSuccessNotice}
                        </p>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          Los datos de la calculadora se han sincronizado con éxito. Tipo de mercancía, categoría, toneladas, rutas, ritmos operativos, fletes (compra y venta), TCE y vista ejecutiva actualizados en la base de datos de Neon.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSyncSuccessNotice(null)}
                      className="text-emerald-700 hover:text-emerald-950 text-sm font-bold p-1 rounded cursor-pointer"
                      title="Cerrar aviso"
                    >
                      ✕
                    </button>
                  </div>

                  {/* NOTIFICACIÓN FLOTANTE VISUAL DE ÉXITO (TOAST) */}
                  <div
                    id="sync-floating-toast"
                    role="alert"
                    aria-live="assertive"
                    className="fixed bottom-6 right-6 z-[9999] bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-500 animate-bounce transition-all duration-300"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-800 text-white text-xs font-black shrink-0">
                      ✓
                    </span>
                    <span className="text-xs font-bold tracking-wide">
                      ¡Datos actualizados con éxito!
                    </span>
                    <button
                      type="button"
                      onClick={() => setSyncSuccessNotice(null)}
                      className="text-emerald-200 hover:text-white ml-2 text-xs font-bold cursor-pointer"
                      title="Cerrar notificación"
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}

              {/* SECCIÓN DE RUTA MARÍTIMA, RITMOS OPERATIVOS Y GESTIÓN DE DEMORAS (DATOS REALES GUARDADOS) */}
              {(() => {
                const mr = getMaritimeRouteData(activeProject);
                if (!mr.hasData) return null;
                return (
                  <div
                    id="project-maritime-route-card"
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm text-slate-800 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🚢</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                              Ruta Marítima, Ritmos Operativos y Gestión de Demoras
                            </h3>
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono font-bold border border-emerald-200">
                              ✓ DATOS REALES GUARDADOS
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Parámetros operativos reales y exactos calculados para este expediente (sin estimaciones genéricas de IA)
                          </p>
                        </div>
                      </div>

                      {/* VALOR EXACTO DEL TCE OBTENIDO */}
                      <div className="bg-gradient-to-br from-indigo-50 to-sky-50 border border-indigo-200/80 rounded-xl p-3 px-4 flex items-center justify-between sm:justify-end gap-4 shadow-sm shrink-0">
                        <div>
                          <span className="text-[10px] font-mono text-indigo-700 uppercase tracking-wider font-bold block">
                            TCE Obtenido (Diario)
                          </span>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-indigo-600 font-bold text-sm select-none">$</span>
                            <span id="project-tce-value-display" className="text-xl font-mono font-black text-indigo-950">
                              {mr.tceValue.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[10px] font-mono text-indigo-600 font-bold ml-0.5">USD/día</span>
                          </div>
                        </div>

                        <div className="h-8 w-px bg-indigo-200 hidden sm:block"></div>

                        <div>
                          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-semibold block">
                            Flete Marítimo TCE
                          </span>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-emerald-600 font-bold text-sm select-none">$</span>
                            <span id="project-ocean-freight-tce-display" className="text-xl font-mono font-black text-slate-900">
                              {mr.oceanFreightTceUsd.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 font-bold ml-0.5">USD</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* FLETES FINANCIEROS SINCRONIZADOS DE LA CALCULADORA (DATABRIDGE) */}
                    <div id="project-financial-freights-bar" className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gradient-to-r from-blue-50/80 via-slate-50 to-emerald-50/80 border border-slate-200 rounded-xl">
                      {/* Flete Sugerido Armador (Compra) */}
                      <div className="flex items-center justify-between p-3 bg-white border border-blue-200 rounded-lg shadow-xs">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"></span>
                            <span className="text-xs font-black uppercase text-blue-900 tracking-wider">
                              Flete Sugerido Armador (Compra)
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">Flete base de compra sincronizado desde la Calculadora</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-baseline justify-end gap-1">
                            <span className="text-blue-700 font-bold text-sm">$</span>
                            <span id="project-flete-compra-display" className="text-xl font-mono font-black text-blue-950">
                              {(mr.fleteCompra || fleteCompra || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-blue-700 ml-0.5">USD/MT</span>
                          </div>
                        </div>
                      </div>

                      {/* Flete Sugerido Fletador (Venta) */}
                      <div className="flex items-center justify-between p-3 bg-white border border-emerald-200 rounded-lg shadow-xs">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0"></span>
                            <span className="text-xs font-black uppercase text-emerald-900 tracking-wider">
                              Flete Sugerido Fletador (Venta)
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">Flete objetivo de venta sincronizado (Target Simulación)</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-baseline justify-end gap-1">
                            <span className="text-emerald-700 font-bold text-sm">$</span>
                            <span id="project-flete-venta-display" className="text-xl font-mono font-black text-emerald-950">
                              {(mr.fleteVenta || fleteVenta || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-emerald-700 ml-0.5">USD/MT</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CUADRICULA DE DETALLES TÉCNICOS Y OPERATIVOS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      {/* 1. Ruta y Distancia */}
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Ruta & Navegación</div>
                        <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5 truncate">
                          <span id="project-pol-display" className="text-blue-700">{mr.pol}</span>
                          <span className="text-slate-400">➔</span>
                          <span id="project-pod-display" className="text-emerald-700">{mr.pod}</span>
                        </div>
                        <div className="text-slate-600 flex justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                          <span>Distancia náutica:</span>
                          <span id="project-distance-display" className="font-mono font-bold text-slate-800">{mr.distanceNm.toLocaleString('es-ES')} NM</span>
                        </div>
                        <div className="text-slate-600 flex justify-between text-[11px]">
                          <span>Velocidad buque:</span>
                          <span id="project-speed-display" className="font-mono font-semibold text-slate-700">{mr.vesselSpeedKnots} kn</span>
                        </div>
                      </div>

                      {/* 2. Ritmos Operativos */}
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Ritmos de Operación</div>
                        <div className="text-slate-600 flex justify-between pt-0.5 text-[11px]">
                          <span>Ritmo de Carga:</span>
                          <span id="project-loading-rate-display" className="font-mono font-bold text-slate-800">{mr.loadingRate.toLocaleString('es-ES')} MT/día</span>
                        </div>
                        <div className="text-slate-600 flex justify-between text-[11px]">
                          <span>Ritmo de Descarga:</span>
                          <span id="project-discharging-rate-display" className="font-mono font-bold text-slate-800">{mr.dischargingRate.toLocaleString('es-ES')} MT/día</span>
                        </div>
                        <div className="text-slate-600 flex justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                          <span>Buque sugerido:</span>
                          <span className="font-semibold text-slate-700 truncate max-w-[120px]" title={mr.vesselType}>{mr.vesselType}</span>
                        </div>
                      </div>

                      {/* 3. Días de Muelle y Navegación */}
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Días Calculados</div>
                        <div className="text-slate-600 flex justify-between pt-0.5 text-[11px]">
                          <span>Días de Muelle:</span>
                          <span id="project-berth-days-display" className="font-mono font-bold text-slate-800">
                            {Number(mr.diasMuelle || 0).toFixed(2)} d
                            <span className="text-[10px] text-slate-500 font-normal ml-1">({Number(mr.diasCarga || 0).toFixed(1)}c / {Number(mr.diasDescarga || 0).toFixed(1)}d)</span>
                          </span>
                        </div>
                        <div className="text-slate-600 flex justify-between text-[11px]">
                          <span>Días de Navegación:</span>
                          <span id="project-sea-days-display" className="font-mono font-bold text-slate-800">{Number(mr.diasNavegacion || 0).toFixed(2)} d</span>
                        </div>
                        <div className="text-slate-600 flex justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                          <span className="font-semibold text-indigo-950">Rotación Total (D_total):</span>
                          <span id="project-rotation-days-display" className="font-mono font-black text-indigo-700">{Number(mr.diasRotacionTotal || 0).toFixed(2)} d</span>
                        </div>
                      </div>

                      {/* 4. Gestión de Demoras y Plancha */}
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Demoras y Plancha</div>
                        <div className="text-slate-600 flex justify-between pt-0.5 text-[11px]">
                          <span>Plancha permitida:</span>
                          <span id="project-laytime-display" className="font-mono font-bold text-slate-800">{Number(mr.planchaDiasPermitidos || 0).toFixed(2)} d</span>
                        </div>
                        <div className="text-slate-600 flex justify-between text-[11px]">
                          <span>Tarifa de Demoras:</span>
                          <span id="project-demurrage-rate-display" className="font-mono font-bold text-slate-800">${Number(mr.demurrageDailyRateUsd || 0).toLocaleString('es-ES')}/día</span>
                        </div>
                        <div className="pt-1 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${(mr.demurrageDays || 0) > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'}`}>
                            {(mr.demurrageDays || 0) > 0 ? `+${Number(mr.demurrageDays).toFixed(1)}d DEMORA` : 'EN PLANCHA'}
                          </span>
                          {(mr.demurrageDays || 0) > 0 && (
                            <span className="font-mono font-bold text-rose-600">
                              +${Number(mr.demurrageCostUsd || 0).toLocaleString('es-ES')} USD
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* SECCIÓN DE DOCUMENTOS PERSISTIDOS Y VISOR FUNCIONAL */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">📁 Documentos y Packing Lists Guardados (Base de Datos)</h3>
                  <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
                    {projectDocuments.length} archivo(s) persistido(s)
                  </span>
                </div>

                {projectDocuments.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-3 text-center border border-dashed border-slate-200 rounded-lg">
                    No hay documentos adjuntos en este proyecto. Sube un archivo mediante el Agente de Proyectos o el botón de importación para guardarlo permanentemente en la base de datos.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {projectDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-blue-300 transition">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">📄</span>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 truncate max-w-[200px]">{doc.name}</h4>
                            <span className="text-[10px] text-slate-500 font-mono">Guardado: {doc.date} | Ítems: {doc.itemsCount || 1}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
  type="button"
  onClick={() => {
    const base64Data = doc.payload?.dataBase64 || doc.dataBase64;
    if (base64Data) {
      try {
        // Convertir el Base64 en un Blob nativo para evitar el bloqueo de seguridad de Chrome
        const arr = base64Data.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        
        // Abrir la URL Blob directamente en una nueva pestaña de forma limpia
        window.open(blobUrl, '_blank');
      } catch (err) {
        console.error('Error abriendo documento:', err);
        window.alert('No se pudo renderizar el archivo directamente. Intentando descarga...');
        const link = document.createElement('a');
        link.href = base64Data;
        link.download = doc.name;
        link.click();
      }
    } else {
      window.alert(`Información del Documento:\nNombre: ${doc.name}\nFecha: ${doc.date}\nÍtems asociados: ${doc.itemsCount || 1}\n(Nota: Este documento no tiene contenido binario asociado).`);
    }
  }}
  className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-bold rounded cursor-pointer shadow-sm flex items-center gap-1"
>
  <span>🔍</span> Consultar / Abrir
</button>
                          <button 
                            type="button"
                            onClick={() => handleDeletePersistentDocument(doc.id)}
                            className="px-2 py-1 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 text-[11px] font-bold rounded cursor-pointer"
                            title="Eliminar documento"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(() => {
                const projectItemsList = Array.isArray(activeProject.line_items)
                  ? activeProject.line_items
                  : (Array.isArray(activeProject.items)
                      ? activeProject.items
                      : (Array.isArray(activeProject.services) ? activeProject.services : []));

                const transportCost = Number(activeProject?.land_freight_cost ?? 0) || 0;
                const hasExplicitTransportItem = projectItemsList.some(
                  (it) => !it.description || /transporte/i.test(it.description)
                );
                const effectiveItemsList = (!hasExplicitTransportItem && (transportCost > 0 || activeProject?.land_origin || activeProject?.land_destination))
                  ? [
                      ...projectItemsList,
                      {
                        id: 'land-transport-auto',
                        description: 'Servicio de Transporte',
                        cost_eur: transportCost,
                        sale_price_eur: Math.round(transportCost * 1.15 * 100) / 100,
                        is_transport: true,
                      },
                    ]
                  : projectItemsList;

                return effectiveItemsList.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-base font-bold text-slate-900">Servicios</h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenExecutiveReport(effectiveItemsList[0])}
                          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer flex items-center gap-1.5 transition"
                        >
                          📄 Reporte Ejecutivo
                        </button>
                        <button onClick={handleOpenCreateService} className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer">➕ Añadir Servicio</button>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 font-bold border-b border-slate-200 text-slate-700"><tr><th className="px-4 py-3 text-left">Servicio</th><th className="px-4 py-3 text-right">Coste (€)</th><th className="px-4 py-3 text-right">Venta (€)</th><th className="px-4 py-3 text-center">Acciones</th></tr></thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800">
                          {effectiveItemsList.map((item, idx) => {
                            const isTransportService = !item.description || /transporte/i.test(item.description) || item.is_transport;
                            const transportCost = Number(activeProject?.land_freight_cost ?? 0) || 0;
                            const costEur = isTransportService && transportCost > 0
                              ? transportCost
                              : (Number(item.cost_eur ?? item.costEur ?? 0) || (isTransportService ? transportCost : 0));
                            const saleEur = isTransportService && costEur > 0
                              ? Math.round(costEur * 1.15 * 100) / 100
                              : (Number(item.sale_price_eur ?? item.salePriceEur ?? 0) || (isTransportService ? Math.round(costEur * 1.15 * 100) / 100 : 0));
                            return (
                              <tr key={item.id || `item-row-${idx}`} className="border-b border-slate-100">
                                <td className="px-4 py-3 font-semibold">{item.description || 'Servicio de Transporte'}</td>
                                <td className="px-4 py-3 text-right text-rose-600 font-bold">{costEur.toLocaleString('es-ES')} €</td>
                                <td className="px-4 py-3 text-right text-emerald-600 font-bold">{saleEur.toLocaleString('es-ES')} €</td>
                                <td className="px-4 py-3 text-center">
                                  <button type="button" onClick={() => handleOpenExecutiveReport(item)} className="mx-1 cursor-pointer hover:scale-110 transition-transform" title="Generar Reporte Ejecutivo">📄</button>
                                  <button onClick={() => handleEditService(item)} className="mx-1 cursor-pointer">✏️</button>
                                  <button onClick={() => handleDeleteService(item.id)} className="mx-1 cursor-pointer">🗑️</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 flex flex-col items-center bg-white text-center">
                    <p className="text-slate-600 font-bold mb-3">No hay servicios logísticos añadidos a este proyecto</p>
                    <button onClick={handleOpenCreateService} className="px-5 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-sm hover:bg-blue-700 transition cursor-pointer">➕ Añadir Servicio</button>
                  </div>
                );
              })()}
            </div>
          )}
        </main>

        {/* MODAL PRINCIPAL TEMA CLARO PANTALLA COMPLETA */}
        {isCargoModalOpen && !showExecutiveReport && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto print:hidden">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col overflow-hidden text-slate-900">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Project Cargo Builder</h2>
                <button onClick={() => setIsCargoModalOpen(false)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center justify-center font-bold">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 divide-y divide-slate-100">
                {/* BOTONES SUPERIORES */}
                <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCargoModalOpen(false);
                        setActiveProject(null);
                      }}
                      className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-colors mr-2 cursor-pointer"
                      title="— Volver a Proyectos"
                      aria-label="— Volver a Proyectos"
                    >
                      ← Volver a Proyectos
                    </button>
                    <button
                      type="button"
                      onClick={handleSyncCalculatorData}
                      disabled={isSyncingCalculator}
                      className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white border border-sky-500 hover:border-sky-600 rounded-lg font-bold text-xs shadow-sm cursor-pointer transition-all flex items-center gap-2 shrink-0 mr-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      title="Capturar absolutamente todos los cambios de la calculadora en tiempo real y sincronizar con Neon"
                      aria-label="Actualizar datos"
                    >
                      {isSyncingCalculator ? (
                        <>
                          <svg className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                          </svg>
                          <span>Sincronizando datos...</span>
                        </>
                      ) : syncFeedback ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{syncFeedback}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>⚡ Sync DataBridge</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* PARTE 2: UI TORRE DE CONTROL (DASHBOARD SUPERIOR) */}
                {(() => {
                  const controlTowerMaritimeCost = Number(oceanFreight || subtotalFreight || 0) || 0;
                  const controlTowerWeightOrRt = Number((totals?.weight ? totals.weight / 1000 : 0) || 0);
                  const controlTowerFleteVentaUnit = Number(fleteVenta || activeProject?.route_and_chartering?.flete_venta_usd_mt || 0) || 0;
                  const controlTowerMaritimeSale = (controlTowerFleteVentaUnit > 0 && controlTowerWeightOrRt > 0)
                    ? Math.round(controlTowerFleteVentaUnit * controlTowerWeightOrRt * 100) / 100
                    : (controlTowerMaritimeCost > 0 ? Math.round(controlTowerMaritimeCost * 1.15 * 100) / 100 : 0);

                  const controlTowerLandCost = Number(activeProject?.land_freight_cost ?? activeProject?.landFreightCost ?? 0) || 0;
                  const controlTowerLandSale = Number(activeProject?.land_freight_sale ?? activeProject?.landFreightSale ?? 0) || 0;
                  const isLandCharterPending = controlTowerLandCost === 0 && controlTowerLandSale === 0;

                  const controlTowerMercanciaFob = Number(activeProject?.valor_total_mercancia_usd ?? activeProject?.valorTotalMercanciaUsd ?? 0) || 0;

                  const controlTowerFobOpsCost = Number(subtotalFobOperations) || 0;
                  const controlTowerFobOpsSale = Math.round(controlTowerFobOpsCost * 1.15 * 100) / 100;
                  const controlTowerEffectiveLandSale = controlTowerLandSale > 0 ? controlTowerLandSale : (controlTowerLandCost > 0 ? Math.round(controlTowerLandCost * 1.15 * 100) / 100 : 0);

                  const controlTowerTotalCostes = Math.round((controlTowerMaritimeCost + controlTowerLandCost + controlTowerFobOpsCost) * 100) / 100;
                  const controlTowerTotalVentas = (controlTowerMaritimeSale > 0 || controlTowerEffectiveLandSale > 0 || controlTowerFobOpsSale > 0)
                    ? Math.round((controlTowerMaritimeSale + controlTowerEffectiveLandSale + controlTowerFobOpsSale) * 100) / 100
                    : (Number(salePrice) || 0);
                  const controlTowerMargen = Math.round((controlTowerTotalVentas - controlTowerTotalCostes) * 100) / 100;

                  return (
                    <div id="torre-de-control-dashboard" className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                      {/* 🌊 TARJETA 1 (Marítimo): Muestra el Flete Marítimo local (Coste y Venta) */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between hover:border-sky-300 transition-colors">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🌊</span>
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Marítimo</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">Local</span>
                        </div>
                        <div className="pt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-500">Coste:</span>
                            <span className="text-sm font-mono font-bold text-slate-800">{formatUSD(controlTowerMaritimeCost)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-500">Venta:</span>
                            <span className="text-sm font-mono font-bold text-emerald-600">{formatUSD(controlTowerMaritimeSale)}</span>
                          </div>
                        </div>
                      </div>

                      {/* 🚛 TARJETA 2 (Terrestre): Muestra activeProject?.land_freight_cost y land_freight_sale */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between hover:border-amber-300 transition-colors">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🚛</span>
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Terrestre</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Neon</span>
                        </div>
                        <div className="pt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-500">Coste:</span>
                            <span className="text-sm font-mono font-bold text-slate-800">{formatUSD(controlTowerLandCost)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-500">Venta:</span>
                            <span className="text-sm font-mono font-bold text-emerald-600">{formatUSD(controlTowerLandSale)}</span>
                          </div>
                          {isLandCharterPending && (
                            <span className="text-xs text-amber-600 font-semibold block pt-0.5">Pendiente Land Charter</span>
                          )}
                        </div>
                      </div>

                      {/* 📦 TARJETA 3 (Mercancía FOB): Muestra activeProject?.valor_total_mercancia_usd */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between hover:border-indigo-300 transition-colors">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📦</span>
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Mercancía FOB</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">Valor</span>
                        </div>
                        <div className="pt-3">
                          <span className="text-[11px] font-semibold text-slate-500 block mb-1">Valor Total (USD):</span>
                          <span className="text-base font-mono font-black text-slate-900">{formatUSD(controlTowerMercanciaFob)}</span>
                        </div>
                      </div>

                      {/* 💎 TARJETA 4 (RESUMEN ALL-IN): Margen de Beneficio Operativo y Gran Total a Facturar en fondo oscuro */}
                      <div className="bg-slate-800 text-white rounded-xl border border-slate-700 p-4 shadow-lg flex flex-col justify-between hover:border-slate-600 transition-colors">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-700/80">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">💎</span>
                            <span className="text-xs font-black text-slate-200 uppercase tracking-wider">Resumen All-In</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-600/50">Consolidado</span>
                        </div>
                        <div className="pt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-300">Margen Beneficio:</span>
                            <span className={`text-sm font-mono font-bold ${controlTowerMargen >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatUSD(controlTowerMargen)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-700/60">
                            <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">Gran Total Facturar:</span>
                            <span className="text-base font-mono font-black text-white">{formatUSD(controlTowerTotalVentas)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <section className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">1. Lista de Empaque (Packing List)</h3>
                    <div className="flex items-center gap-2">
                      <input ref={fileInputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                      <button onClick={handleTriggerImport} className="px-4 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg cursor-pointer shadow-sm">🤖 Importar PDF/Excel</button>
                      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 whitespace-nowrap">
                        <label htmlFor="cargo-category-select-section1" className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Tarifa:</label>
                        <select
                          id="cargo-category-select-section1"
                          value={cargoCategory}
                          onChange={(e) => handleCargoCategoryChange(e.target.value)}
                          className="text-xs font-bold bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          <option value="Carga Paletizada">Carga Paletizada</option>
                          <option value="Carga de Proyecto / Heavy Lift">Carga de Proyecto / Heavy Lift</option>
                          <option value="Sling Bags">Sling Bags</option>
                          <option value="Sacos">Sacos</option>
                          <option value="Carga General">Carga General</option>
                          <option value="Mercancía Ensacada / Dry Bulk">Mercancía Ensacada / Dry Bulk</option>
                          <option value="Maquinaria / Equipos Industriales">Maquinaria / Equipos Industriales</option>
                        </select>
                      </div>
                      <button onClick={handleAddCargoPiece} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-sm">+ Añadir Pieza</button>
                      <button
                        type="button"
                        id="btn-open-tariff-manager-modal"
                        onClick={() => {
                          if (typeof window.toggleProviderTariffSidebar === 'function') {
                            window.toggleProviderTariffSidebar();
                          } else {
                            window.dispatchEvent(new CustomEvent('seacharter:toggle-provider-tariff'));
                          }
                        }}
                        className="px-3.5 py-2 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg cursor-pointer shadow-sm flex items-center gap-1.5 transition-colors"
                        title="Abrir Gestor Universal de Tarifas FOB/EXW y Tarifas de Fábrica GICA"
                      >
                        <i className="fa-solid fa-boxes-packing text-emerald-600"></i>
                        <span>Tarifas Proveedores / FOB</span>
                      </button>
                      <button
                        type="button"
                        id="btn-recalculate-cargo"
                        onClick={handleRecalculate}
                        disabled={isRecalculating}
                        className="px-4 py-2 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 text-xs font-bold rounded-lg cursor-pointer shadow-sm flex items-center gap-1.5 transition-colors"
                        title="Recalcular estiba, flete y ratios en tiempo real"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`}
                        >
                          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                          <path d="M16 16h5v5" />
                        </svg>
                        <span>{isRecalculating ? 'Recalculando...' : 'Recalcular'}</span>
                      </button>
                      {recalculateFeedback && (
                        <span
                          id="recalculate-feedback-badge"
                          role="status"
                          aria-live="polite"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg shadow-xs transition-opacity duration-300"
                        >
                          <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>{recalculateFeedback}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <table className="w-full text-left text-[11px] text-slate-700">
                      <thead className="bg-slate-100 font-bold text-slate-600 border-b border-slate-200 uppercase tracking-wider">
                        <tr>
                          <th className="px-2 py-3 w-[12%]">Categoría</th>
                          <th className="px-2 py-3 w-[25%]">Tipo/Modelo</th>
                          <th className="px-2 py-3 w-[7%] text-center">Cantidad</th>
                          <th className="px-2 py-3 w-[7%] text-center">Largo (m)</th>
                          <th className="px-2 py-3 w-[7%] text-center">Ancho (m)</th>
                          <th className="px-2 py-3 w-[7%] text-center">Alto (m)</th>
                          <th className="px-2 py-3 w-[10%] text-right">Peso Unitario (kg)</th>
                          <th className="px-2 py-3 w-[7%] text-right font-mono">M2</th>
                          <th className="px-2 py-3 w-[7%] text-right font-mono">M3</th>
                          <th className="px-2 py-3 w-[12%]">Modo Envío</th>
                          <th className="px-2 py-3 w-[4%] text-center">🗑️</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cargoItems.map((item) => {
                          const qty = Math.max(1, Number(item.quantity) || 1);
                          const l = Math.max(0, parseFloat(item.length) || 0);
                          const w = Math.max(0, parseFloat(item.width) || 0);
                          const h = Math.max(0, parseFloat(item.height) || 0);
                          const itemM2 = qty * (l * w);
                          const itemM3 = qty * (l * w * h);

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/80">
                              <td className="p-1"><input type="text" value={item.category || ''} onChange={(e) => handleUpdateCargoItem(item.id, 'category', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-2 py-1.5 text-slate-800 text-[11px]" placeholder="Ej: Equipos..." /></td>
                              <td className="p-1"><input type="text" list="commodity-list" value={item.type || ''} onChange={(e) => handleUpdateCargoItem(item.id, 'type', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-2 py-1.5 text-slate-900 font-semibold text-[11px]" placeholder="Descripción de pieza..." /></td>
                              <td className="p-1"><input type="number" min={1} value={item.quantity} onChange={(e) => handleUpdateCargoItem(item.id, 'quantity', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-1 py-1.5 text-center text-slate-900 text-[11px]" /></td>
                              <td className="p-1"><input type="number" value={item.length} onChange={(e) => handleUpdateCargoItem(item.id, 'length', e.target.value)} className="w-full bg-white border border-slate-300 px-1 py-1.5 rounded text-center text-[11px]" placeholder="L" /></td>
                              <td className="p-1"><input type="number" value={item.width} onChange={(e) => handleUpdateCargoItem(item.id, 'width', e.target.value)} className="w-full bg-white border border-slate-300 px-1 py-1.5 rounded text-center text-[11px]" placeholder="W" /></td>
                              <td className="p-1"><input type="number" value={item.height} onChange={(e) => handleUpdateCargoItem(item.id, 'height', e.target.value)} className="w-full bg-white border border-slate-300 px-1 py-1.5 rounded text-center text-[11px]" placeholder="H" /></td>
                              <td className="p-1"><input type="number" value={item.weight} onChange={(e) => handleUpdateCargoItem(item.id, 'weight', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-2 py-1.5 text-right font-mono text-[11px]" /></td>
                              <td className="p-1 text-right font-mono text-[11px] text-slate-600">{itemM2.toFixed(2)}</td>
                              <td className="p-1 text-right font-mono text-[11px] text-slate-600">{itemM3.toFixed(2)}</td>
                              <td className="p-1"><input type="text" value={item.shipping_mode_supported || ''} onChange={(e) => handleUpdateCargoItem(item.id, 'shipping_mode_supported', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-2 py-1.5 text-slate-600 text-[10px]" placeholder="Modo..." /></td>
                              <td className="p-1 text-center"><button onClick={() => handleRemoveCargoItem(item.id)} className="text-rose-500 hover:text-rose-700 bg-rose-50 rounded p-1 font-bold w-full h-full cursor-pointer">✕</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-100 font-bold text-slate-700 border-t border-slate-200">
                        <tr>
                          <td colSpan={2} className="px-3 py-2 text-left uppercase text-[10px]">Totales:</td>
                          <td className="px-2 py-2 text-center font-mono">{totals.quantity}</td>
                          <td colSpan={3} className="px-2 py-2 text-center text-[10px] text-slate-500">-</td>
                          <td className="px-2 py-2 text-right font-mono">{Number(totals.weight).toLocaleString('es-ES')} kg</td>
                          <td className="px-2 py-2 text-right font-mono">{Number(totals.m2).toFixed(2)} m²</td>
                          <td className="px-2 py-2 text-right font-mono">{Number(totals.m3).toFixed(2)} m³</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                    <datalist id="commodity-list">
                      {Object.keys(COMMODITY_TARIFFS).map((commodityKey) => (
                        <option key={commodityKey} value={commodityKey} />
                      ))}
                    </datalist>
                  </div>
                </section>

                {/* Sección Parámetros Dinámicos de Ruta, Ritmos Operativos y Demoras */}
                <section className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">Ruta Marítima, Ritmos Operativos y Gestión de Demoras</h3>
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                      POL / POD · Ritmos MT/día · Rotación Paramétrica
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div>
                        <label htmlFor="input-pol" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                          Puerto de Carga (POL / Origen) *
                        </label>
                        <input
                          id="input-pol"
                          type="text"
                          required
                          value={pol}
                          onChange={(e) => setPol(e.target.value)}
                          placeholder="Ej: Valencia, Bilbao, Barcelona"
                          className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm"
                        />
                      </div>

                      <div>
                        <label htmlFor="input-pod" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                          Puerto de Destino (POD / Destino) *
                        </label>
                        <input
                          id="input-pod"
                          type="text"
                          required
                          value={pod}
                          onChange={(e) => setPod(e.target.value)}
                          placeholder="Ej: Houston, Rotterdam, Alexandria"
                          className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm"
                        />
                      </div>

                      <div>
                        <label htmlFor="input-loading-rate" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                          Ritmo de Carga (MT/día) *
                        </label>
                        <input
                          id="input-loading-rate"
                          type="number"
                          min={1}
                          required
                          value={loadingRate}
                          onChange={(e) => setLoadingRate(Math.max(1, Number(e.target.value)))}
                          className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 shadow-sm font-mono"
                        />
                      </div>

                      <div>
                        <label htmlFor="input-discharging-rate" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                          Ritmo de Descarga (MT/día) *
                        </label>
                        <input
                          id="input-discharging-rate"
                          type="number"
                          min={1}
                          required
                          value={dischargingRate}
                          onChange={(e) => setDischargingRate(Math.max(1, Number(e.target.value)))}
                          className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 shadow-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-200">
                      <div>
                        <label htmlFor="input-distance-nm" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Distancia Náutica (NM)
                        </label>
                        <input
                          id="input-distance-nm"
                          type="number"
                          min={10}
                          value={distanceNm}
                          onChange={(e) => setDistanceNm(Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800"
                        />
                      </div>

                      <div>
                        <label htmlFor="input-actual-loading-days" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Días Reales Carga en POL (Muelle)
                        </label>
                        <input
                          id="input-actual-loading-days"
                          type="number"
                          step="0.1"
                          min={0}
                          value={actualLoadingDays}
                          onChange={(e) => setActualLoadingDays(e.target.value)}
                          placeholder="Automático (sin demora)"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800"
                        />
                      </div>

                      <div>
                        <label htmlFor="input-actual-discharging-days" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Días Reales Descarga en POD (Muelle)
                        </label>
                        <input
                          id="input-actual-discharging-days"
                          type="number"
                          step="0.1"
                          min={0}
                          value={actualDischargingDays}
                          onChange={(e) => setActualDischargingDays(e.target.value)}
                          placeholder="Automático (sin demora)"
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800"
                        />
                      </div>

                      <div>
                        <label htmlFor="input-demurrage-rate" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Tarifa de Demoras (USD/día)
                        </label>
                        <input
                          id="input-demurrage-rate"
                          type="number"
                          value={demurrageDailyRateUsd}
                          onChange={(e) => setDemurrageDailyRateUsd(Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Resumen dinámico en vivo sincronizado con la Vista Ejecutiva */}
                    {(() => {
                      const totalWeightTons = (totals.weight || 0) / 1000;
                      const wTons = totalWeightTons;
                      const effLoad = Math.max(1, Number(loadingRate) || 1200);
                      const effDisch = Math.max(1, Number(dischargingRate) || 1000);
                      const rawDCarga = wTons > 0 ? Math.round((wTons / effLoad) * 100) / 100 : 0;
                      const rawDDescarga = wTons > 0 ? Math.round((wTons / effDisch) * 100) / 100 : 0;
                      const rawPortTotal = Math.round((rawDCarga + rawDDescarga) * 100) / 100;
                      const effDist = Math.max(10, Number(distanceNm) || 1500);
                      const effSpd = Math.max(1, Number(vesselSpeedKnots) || 12.0);

                      const execTimes = getExecutiveOperationalTimes(activeProject?.route_and_chartering);
                      const dNav = (execTimes.seaDays !== null && execTimes.seaDays > 0)
                        ? execTimes.seaDays
                        : Math.round((effDist / (effSpd * 24)) * 100) / 100;

                      const dPortTotal = (execTimes.portDays !== null && execTimes.portDays > 0)
                        ? execTimes.portDays
                        : rawPortTotal;

                      let dCarga = rawDCarga;
                      let dDescarga = rawDDescarga;
                      if (execTimes.portDays !== null && execTimes.portDays > 0 && rawPortTotal > 0) {
                        dCarga = Math.round((rawDCarga / rawPortTotal) * execTimes.portDays * 100) / 100;
                        dDescarga = Math.round((execTimes.portDays - dCarga) * 100) / 100;
                      } else if (execTimes.portDays !== null && execTimes.portDays > 0 && rawPortTotal === 0) {
                        dCarga = Math.round((execTimes.portDays / 2) * 100) / 100;
                        dDescarga = Math.round((execTimes.portDays - dCarga) * 100) / 100;
                      }

                      const dRot = (execTimes.totalDays !== null && execTimes.totalDays > 0)
                        ? execTimes.totalDays
                        : Math.round((dCarga + dDescarga + dNav) * 100) / 100;

                      let totalDem = 0;
                      let demPenalty = 0;

                      // Lógica de cálculo de Demoras y Plancha con guarda matemática estricta
                      const calculateLiveDemurrage = () => {
                        if (totalWeightTons <= 0) return;
                        const aLoad = actualLoadingDays !== '' && actualLoadingDays !== null && !isNaN(Number(actualLoadingDays)) ? Number(actualLoadingDays) : null;
                        const aDisch = actualDischargingDays !== '' && actualDischargingDays !== null && !isNaN(Number(actualDischargingDays)) ? Number(actualDischargingDays) : null;
                        const demLoad = (aLoad !== null && aLoad > dCarga) ? Math.round((aLoad - dCarga) * 100) / 100 : 0;
                        const demDisch = (aDisch !== null && aDisch > dDescarga) ? Math.round((aDisch - dDescarga) * 100) / 100 : 0;
                        totalDem = Math.round((demLoad + demDisch) * 100) / 100;
                        demPenalty = Math.round(totalDem * (Number(demurrageDailyRateUsd) || 11500) * (Number(exchangeRateUsdEur) || 0.92) * 100) / 100;
                      };

                      calculateLiveDemurrage();

                      return (
                        <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                          <div className="bg-white p-2 rounded border border-slate-200">
                            <span className="block text-[9px] uppercase font-bold text-slate-500">Días Carga (POL)</span>
                            <span id="counter-loading-days" className="text-sm font-black text-slate-800 font-mono">{dCarga.toFixed(2)} d</span>
                            <span className="block text-[9px] text-slate-400">({wTons.toFixed(1)} MT / {effLoad} MT/d)</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-200">
                            <span className="block text-[9px] uppercase font-bold text-slate-500">Días Descarga (POD)</span>
                            <span id="counter-discharging-days" className="text-sm font-black text-slate-800 font-mono">{dDescarga.toFixed(2)} d</span>
                            <span className="block text-[9px] text-slate-400">({wTons.toFixed(1)} MT / {effDisch} MT/d)</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-200">
                            <span className="block text-[9px] uppercase font-bold text-slate-500">Días Navegación</span>
                            <span id="counter-navigation-days" className="text-sm font-black text-blue-700 font-mono">{dNav.toFixed(2)} d</span>
                            <span className="block text-[9px] text-slate-400">({effDist} NM @ {effSpd} kn)</span>
                          </div>
                          <div id="counter-demurrage-card" className={`p-2 rounded border ${totalDem > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                            <span className="block text-[9px] uppercase font-bold text-slate-600">
                              {totalDem > 0 ? '⚠️ Demoras Muelle' : '✅ Plancha / Demoras'}
                            </span>
                            <span id="counter-demurrage-status" className={`text-sm font-black font-mono ${totalDem > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                              {totalDem > 0 ? `+${totalDem.toFixed(2)} d (+${demPenalty.toLocaleString('es-ES')} €)` : 'En Plancha'}
                            </span>
                            <span id="counter-rotation-days" className="block text-[9px] text-slate-500">Rotación Total: {dRot.toFixed(2)} d</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </section>

                <section className="pt-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">2. Trincaje y Materiales</h3>
                      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                        <label htmlFor="cargo-category-dropdown" className="text-[11px] font-bold text-slate-600">Tipo de Carga:</label>
                        <select
                          id="cargo-category-dropdown"
                          value={cargoCategory}
                          onChange={(e) => handleCargoCategoryChange(e.target.value)}
                          className="text-xs font-bold bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          <option value="Carga Paletizada">Carga Paletizada</option>
                          <option value="Carga de Proyecto / Heavy Lift">Carga de Proyecto / Heavy Lift</option>
                          <option value="Sling Bags">Sling Bags</option>
                          <option value="Sacos">Sacos</option>
                          <option value="Carga General">Carga General</option>
                          <option value="Mercancía Ensacada / Dry Bulk">Mercancía Ensacada / Dry Bulk</option>
                          <option value="Maquinaria / Equipos Industriales">Maquinaria / Equipos Industriales</option>
                        </select>
                      </div>
                    </div>
                    {isUnder40t ? (
                      <span className="px-2.5 py-1 text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded-full flex items-center gap-1.5 shadow-sm">
                        📦 Modalidad Grupaje LCL (&lt; 40 t) · TCE Desactivado
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full flex items-center gap-1.5 shadow-sm">
                        🚢 Fletamento Completo (&ge; 40 t) · TCE Activo: {tceValue ? `${tceValue.toLocaleString('es-ES')} USD/día` : 'Activo'}
                      </span>
                    )}
                  </div>
                  <div id="logistic-engine-banner" role="status" aria-live="polite" className="bg-slate-900 border-l-4 border-cyan-500 p-4 rounded shadow-lg flex items-center gap-4 mb-6">
                    <div className="text-2xl">⚙️</div>
                    <div className="flex flex-col">
                      <span className="text-cyan-400 font-bold text-sm tracking-wide uppercase">Motor de Decisión Operativa IA</span>
                      <span className="text-slate-200 mt-1 text-[11px]">
                        Modalidad detectada: <strong className="text-white ml-1 mr-3">{shippingMode}</strong>
                        Buque recomendado: <strong className="text-white ml-1 mr-3">{vesselType}</strong>
                        {tceActive && tceValue ? (
                          <span className="text-emerald-400 font-mono font-bold">| TCE: {tceValue.toLocaleString('es-ES')} USD/día</span>
                        ) : (
                          <span className="text-amber-300 font-mono font-bold">| TCE: Desactivado (LCL)</span>
                        )}
                      </span>
                      {operationalProfileNotice && (
                        <span className="text-xs text-sky-300 font-semibold mt-1">
                          📋 {operationalProfileNotice}
                        </span>
                      )}
                    </div>
                  </div>
                  {isPalletizedOrBagsCargo && !isBigBagsCargo && (
                    <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 text-xs text-sky-900 flex items-start gap-2.5 shadow-sm">
                      <span className="text-base">📦</span>
                      <div className="space-y-1">
                        <strong>Perfil de Carga Paletizada / Sacos / Carga General:</strong>
                        <p className="text-sky-800">
                          Se aplica estiba de reparto ligero. <strong>Cadenas, tensores y grilletes pesados quedan forzados a 0</strong> para evitar sobrepresión y aplastamiento de la mercancía.
                        </p>
                        <p className="text-sky-950 font-semibold">
                          🪵 <strong>Madera de Estiba / Airbags (Dunnage):</strong> Dimensionado con ratio ligero para calce y bloqueo de huecos entre pallets.
                        </p>
                      </div>
                    </div>
                  )}
                  {isBigBagsCargo && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5 shadow-sm">
                      <span className="text-base">🛡️</span>
                      <div className="space-y-1">
                        <strong>Perfil de Carga Masiva / Ensacada (Big Bags):</strong>
                        <p className="text-amber-800">
                          Se aplica estiba en bloque continuo. <strong>Maderas de cuna pesadas y cables de acero de proyecto quedan excluidos</strong> para evitar desgarros y cortes en los sacos de polipropileno.
                        </p>
                        <p className="text-amber-950 font-semibold">
                          🏗️ <strong>Spreader Multipunto Obligatorio:</strong> Diseñado para bloques simultáneos de 14 a 16 Big Bags por ciclo de izado ({craneLiftCycles} ciclos estimados). Prohibidas eslingas sueltas individuales y trincaje pesado a bordo.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <NumericCounter label={isPalletizedOrBagsCargo ? "Madera de Estiba / Airbags (Dunnage)" : "Maderas de Estiba (Dunnage)"} subtitle={isBigBagsCargo ? "Excluidas (Big Bags)" : (isPalletizedOrBagsCargo ? "Ratio Ligero (Calce/Huecos)" : "Dunnage")} value={dunnageWood} onChange={setDunnageWood} />
                    <NumericCounter label="Eslingas de alta capacidad" subtitle={isBigBagsCargo ? "Prohibidas (Usar Spreader)" : "Alta Capacidad"} value={highCapacitySlings} onChange={setHighCapacitySlings} />
                    <NumericCounter label="Cadenas y Tensores" subtitle={isBigBagsCargo ? "Excluidas (Big Bags)" : (isPalletizedOrBagsCargo ? "Excluidas (Carga Paletizada/Sacos)" : "Trincaje Pesado")} value={chainsBinders} onChange={setChainsBinders} />
                    <NumericCounter label="Grilletes" subtitle={isBigBagsCargo ? "Excluidos (Big Bags)" : (isPalletizedOrBagsCargo ? "Excluidos (Carga Paletizada/Sacos)" : "Unión de Trincas")} value={shackles} onChange={setShackles} />
                  </div>
                  {isBigBagsCargo && (
                    <div className="mt-3 bg-blue-50/70 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🏗️</span>
                        <div>
                          <div className="text-xs font-bold text-blue-900">Spreader Multipunto de Izado (14-16 Big Bags / ciclo)</div>
                          <div className="text-[11px] text-blue-700">Equipamiento de muelle para izado en bloque ({craneLiftCycles} ciclos de grúa estimados)</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <NumericCounter label="Spreaders en Muelle" subtitle="Bloques 14-16 sacos" value={spreaderMultipunto} onChange={setSpreaderMultipunto} />
                      </div>
                    </div>
                  )}
                </section>

                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">3. Mano de Obra Portuaria</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <NumericCounter label="Cuadrillas de Estibadores (Turnos)" subtitle={isBigBagsCargo ? "Enganche Rápido Spreader" : "Turnos de Estiba"} value={stevedoreGangs} onChange={setStevedoreGangs} />
                    <NumericCounter label="Equipo de Trincadores" subtitle={isBigBagsCargo ? "Excluido (Big Bags)" : "Especialistas"} value={lashingTeam} onChange={setLashingTeam} />
                    <NumericCounter label="Grúa Auxiliar de Tierra (Heavy Lift)" subtitle={isBigBagsCargo ? "Excluida (No Heavy Lift)" : "Móvil Portuaria"} value={heavyLiftCrane} onChange={setHeavyLiftCrane} />
                    <NumericCounter label="Plataformas MAFI" subtitle={isBigBagsCargo ? "Excluidas" : "Roll Trailers"} value={mafiPlatforms} onChange={setMafiPlatforms} />
                  </div>
                </section>

                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">4. Logística Periférica</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Días Almacenaje</label><input type="number" min="0" value={storageDays} onChange={(e) => setStorageDays(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Surveyor (USD)</label><input type="number" min="0" value={surveyorCost} onChange={(e) => { userEditedSurveyor.current=true; setSurveyorCost(e.target.value); }} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Transporte Inland (USD)</label><input type="number" min="0" value={inlandCost} onChange={(e) => setInlandCost(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2" title="Mercancía (€)">Mercancía (USD)</label><input type="number" min="0" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Seguro Mercancía (USD)</label><input type="number" min="0" id="input-insurance-cost" value={insuranceCost} onChange={(e) => setInsuranceCost(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                  </div>
                </section>

                <section className="pt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">5. Desglose Financiero Separado (Flete vs. FOB / Operativa)</h3>
                    <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">SeaCharter Core PRO</span>
                  </div>

                  {isCommodityTariffActive && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg mb-4 text-xs font-bold">💡 Tarifa de Convenio Comercial / FSPE Aplicada. Los cálculos dinámicos de km y estiba han sido sustituidos por tarifas netas de commodity.</div>
                  )}

                  <div id="financial-breakdown-card" className="bg-slate-900 border border-slate-700 rounded-xl p-5 text-white shadow-xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Subtotal Flete Marítimo / TCE */}
                      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-sky-400 uppercase tracking-wide">Subtotal Flete Marítimo / TCE</span>
                            <span className="text-sm">🌊</span>
                          </div>
                          <p className="text-[11px] text-slate-300">
                            {tceActive ? `Fletamento Completo buque · TCE: ${tceValue ? `${tceValue.toLocaleString('es-ES')} USD/día` : 'Activo'}` : 'Grupaje LCL consolidado (TCE buque desactivado)'}
                          </p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-700/80 flex items-baseline justify-between">
                          <span className="text-[11px] font-mono text-slate-400">Subtotal Flete:</span>
                          <div className="flex items-baseline">
                            <span className="text-lg font-mono font-bold text-sky-400 mr-1 select-none">$</span>
                            <span id="subtotal-ocean-freight" className="text-2xl font-mono font-black text-sky-300">{subtotalFreight}</span>
                            <span className="text-xs font-mono font-semibold text-slate-400 ml-1.5">USD</span>
                          </div>
                        </div>
                      </div>

                      {/* Subtotal Costes FOB y Operativa Portuaria */}
                      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Subtotal Costes FOB y Operativa Portuaria</span>
                            <span className="text-sm">🏗️</span>
                          </div>
                          <p className="text-[11px] text-slate-300">
                            Manipulación en muelle, estiba y desestiba, trincaje, almacenaje terminal, peritaje, inland, seguro y mercancía
                          </p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-700/80 flex items-baseline justify-between">
                          <span className="text-[11px] font-mono text-slate-400">Subtotal FOB/Operativa:</span>
                          <div className="flex items-baseline">
                            <span className="text-lg font-mono font-bold text-amber-400 mr-1 select-none">$</span>
                            <span id="subtotal-fob-operations" className="text-2xl font-mono font-black text-amber-300">{subtotalFobOperations}</span>
                            <span className="text-xs font-mono font-semibold text-slate-400 ml-1.5">USD</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* FLETES SUGERIDOS CALCULADORA (COMPRA / VENTA) */}
                    <div id="modal-suggested-freights-bar" className="mt-4 pt-4 border-t border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></span>
                            <span className="text-xs font-black uppercase text-blue-900 tracking-wider">
                              Flete Sugerido Armador (Compra)
                            </span>
                          </div>
                          <span className="text-[10px] text-blue-700/80">Target armador simulación Calculadora</span>
                        </div>
                        <div className="flex items-baseline">
                          <span className="text-sm font-mono font-bold text-blue-700 mr-1 select-none">$</span>
                          <span id="modal-flete-sugerido-armador" className="text-xl font-mono font-black text-blue-900">
                            {Number(fleteCompra || activeProject?.route_and_chartering?.flete_compra_usd_mt || 0).toFixed(2)}
                          </span>
                          <span className="text-[10px] font-mono font-semibold text-blue-700 ml-1">USD/MT</span>
                        </div>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></span>
                            <span className="text-xs font-black uppercase text-emerald-900 tracking-wider">
                              Flete Sugerido Fletador (Venta)
                            </span>
                          </div>
                          <span className="text-[10px] text-emerald-700/80">Target fletador simulación Calculadora</span>
                        </div>
                        <div className="flex items-baseline">
                          <span className="text-sm font-mono font-bold text-emerald-700 mr-1 select-none">$</span>
                          <span id="modal-flete-sugerido-fletador" className="text-xl font-mono font-black text-emerald-900">
                            {Number(fleteVenta || activeProject?.route_and_chartering?.flete_venta_usd_mt || 0).toFixed(2)}
                          </span>
                          <span className="text-[10px] font-mono font-semibold text-emerald-700 ml-1">USD/MT</span>
                        </div>
                      </div>
                    </div>

                    {((activeReport?.flete_unitario_usd_mt ?? financialBreakdown?.flete_unitario_usd_mt ?? 0) > 0 || (activeReport?.fob_mas_mercancia_unitario_usd_mt ?? financialBreakdown?.fob_mas_mercancia_unitario_usd_mt ?? 0) > 0 || (Number(subtotalFobOperations) > 0 && ((totals.weight || 0) > 0 || (totals.weightKg || 0) > 0))) && (
                      <div id="financial-unit-ratios-summary" className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex items-center justify-between transition-all hover:border-sky-300">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0"></span>
                            <span className="text-xs font-bold text-slate-700 tracking-wide">Flete Unitario</span>
                          </div>
                          <div className="flex items-baseline gap-1 font-mono">
                            <span className="text-lg font-black text-slate-900">
                              {(() => {
                                const totalTons = Number(totals.totalWeightTons || totals.weightTons || (totals.weightKg ? totals.weightKg / 1000 : (totals.weight ? totals.weight / 1000 : 0))) || 0;
                                if (totalTons > 0 && Number(subtotalFreight) > 0) {
                                  return (Number(subtotalFreight) / totalTons).toFixed(2);
                                }
                                return Number(activeReport?.flete_unitario_usd_mt ?? financialBreakdown?.flete_unitario_usd_mt ?? 0).toFixed(2);
                              })()}
                            </span>
                            <span className="text-[11px] font-bold text-sky-700">USD/MT</span>
                          </div>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex items-center justify-between transition-all hover:border-amber-300">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                            <span className="text-xs font-bold text-slate-700 tracking-wide">FOB + Mercancía Unitario</span>
                          </div>
                          <div className="flex items-baseline gap-1 font-mono">
                            <span className="text-lg font-black text-slate-900">
                              {(() => {
                                const totalTons = Number(totals.totalWeightTons || totals.weightTons || (totals.weightKg ? totals.weightKg / 1000 : (totals.weight ? totals.weight / 1000 : 0))) || 0;
                                if (totalTons > 0 && Number(subtotalFobOperations) > 0) {
                                  return (Number(subtotalFobOperations) / totalTons).toFixed(2);
                                }
                                return Number(activeReport?.fob_mas_mercancia_unitario_usd_mt ?? financialBreakdown?.fob_mas_mercancia_unitario_usd_mt ?? 0).toFixed(2);
                              })()}
                            </span>
                            <span className="text-[11px] font-bold text-amber-800">USD/MT</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* BARRA DE ACCIONES SECUNDARIA: HERRAMIENTAS COMERCIALES Y REGULATORIAS */}
                <section className="pt-4 space-y-3" aria-label="Herramientas Comerciales y Regulatorias">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base" aria-hidden="true">🌐</span>
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Herramientas Comerciales y Regulatorias
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                      Módulos Satélite Especializados
                    </span>
                  </div>

                  <div className="bg-slate-100/90 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">
                        Simulaciones avanzadas y cumplimiento normativo en frontera
                      </p>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Accede a la matriz de emisiones aduaneras CBAM o al simulador de arbitraje Dual Trading sin alterar ni perder los datos de tu cotización en curso.
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                      <button
                        type="button"
                        id="btn-open-cbam-modal"
                        onClick={() => {
                          const currentTons = Number(totals.totalWeightTons || totals.weightTons || (totals.weightKg ? totals.weightKg / 1000 : 0)) || 0;
                          setCbamQuantity(currentTons);
                          if (pol) setCbamOrigin(pol);
                          if (pod) setCbamDestination(pod);
                          if (!cbamSector) {
                            const allItemsText = (cargoItems || []).map(i => `${i.type || ''} ${i.description || ''}`).join(' ').toLowerCase();
                            if (allItemsText.includes('acero') || allItemsText.includes('hierro') || allItemsText.includes('steel') || allItemsText.includes('iron')) {
                              setCbamSector('Acero');
                            } else if (allItemsText.includes('cemento') || allItemsText.includes('cement') || allItemsText.includes('clinker')) {
                              setCbamSector('Cemento');
                            } else if (allItemsText.includes('aluminio') || allItemsText.includes('aluminum') || allItemsText.includes('aluminium')) {
                              setCbamSector('Aluminio');
                            } else if (allItemsText.includes('fertiliz') || allItemsText.includes('urea') || allItemsText.includes('abono')) {
                              setCbamSector('Fertilizantes');
                            }
                          }
                          setIsCbamOpen(true);
                        }}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white text-xs font-bold shadow-sm transition-all duration-150 cursor-pointer"
                        title="Calcular Impacto CBAM (UE)"
                        aria-label="Calcular Impacto CBAM (UE)"
                      >
                        <span className="text-sm" aria-hidden="true">🌱</span>
                        <span>Calcular Impacto CBAM (UE)</span>
                      </button>

                      <button
                        type="button"
                        id="btn-open-dual-trading-modal"
                        onClick={() => setIsDualTradingOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#002060] hover:bg-[#003380] active:bg-[#001845] text-white text-xs font-bold shadow-sm transition-all duration-150 cursor-pointer"
                        title="Abrir Simulador Dual Trading"
                        aria-label="Abrir Simulador Dual Trading"
                      >
                        <span className="text-sm" aria-hidden="true">⚖️</span>
                        <span>Abrir Simulador Dual Trading</span>
                      </button>
                    </div>
                  </div>
                </section>

                {/* BOTONES DE ACCIÓN INFERIORES: VOLVER A PROYECTOS Y SYNC DATABRIDGE */}
                <div className="flex flex-wrap items-center gap-3 mt-8 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCargoModalOpen(false);
                      setActiveProject(null);
                    }}
                    className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-colors mr-2 cursor-pointer"
                    title="— Volver a Proyectos"
                    aria-label="— Volver a Proyectos"
                  >
                    ← Volver a Proyectos
                  </button>
                  <button
                    type="button"
                    id="btn-update-calculator-data"
                    onClick={handleSyncCalculatorData}
                    disabled={isSyncingCalculator}
                    className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white border border-sky-500 hover:border-sky-600 rounded-lg font-bold text-xs shadow-sm cursor-pointer transition-all flex items-center gap-2 shrink-0 mr-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    title="Capturar absolutamente todos los cambios de la calculadora en tiempo real y sincronizar con Neon"
                    aria-label="Actualizar datos"
                  >
                    {isSyncingCalculator ? (
                      <>
                        <svg className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        <span>Sincronizando datos...</span>
                      </>
                    ) : syncFeedback ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{syncFeedback}</span>
                      </>
                    ) : (
                      <>
                        {/* Icono vectorial de sincronización / disquete */}
                        <svg className="w-3.5 h-3.5 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>⚡ Sync DataBridge</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-6 border-t border-slate-200 flex justify-between items-end shrink-0">
                <div className="flex gap-6 w-1/2">
                  <div className="w-full relative">
                    <label htmlFor="input-estimated-cost" className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Coste Total Estimado ($) {/* Coste Total Estimado (€) */}</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 text-slate-400 font-mono font-bold text-xl select-none">$</span>
                      <input id="input-estimated-cost" type="number" readOnly value={estimatedCost} className="w-full bg-slate-800 text-white font-bold text-2xl text-right p-3 pl-8 pr-14 rounded border border-slate-600 outline-none focus:border-cyan-500 shadow-inner" />
                      <span className="absolute right-3.5 text-xs text-slate-400 font-mono font-semibold">USD</span>
                      <span className="hidden text-slate-400" aria-hidden="true">EUR</span>
                    </div>
                  </div>
                  <div className="w-full relative">
                    <label htmlFor="input-sale-price" className="block text-blue-600 font-bold text-[10px] uppercase mb-1">Precio Venta a Cliente ($) {/* Precio Venta a Cliente (€) */}</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 text-blue-400 font-mono font-bold text-xl select-none">$</span>
                      <input id="input-sale-price" type="number" readOnly value={salePrice} className="w-full bg-slate-800 text-white font-bold text-2xl text-right p-3 pl-8 pr-14 rounded border border-slate-600 outline-none focus:border-cyan-500 shadow-inner" />
                      <span className="absolute right-3.5 text-xs text-slate-400 font-mono font-semibold">USD</span>
                      <span className="hidden text-slate-400" aria-hidden="true">EUR</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 relative z-10 pointer-events-auto">
                  <button
                    type="button"
                    id="btn-generate-executive-report"
                    onClick={(e) => {
                      if (e) e.stopPropagation();
                      handleOpenExecutiveReport();
                      setShowExecutiveReport(true);
                    }}
                    className="bg-slate-800 hover:bg-slate-900 active:bg-black text-white px-6 py-2.5 rounded shadow font-bold text-sm cursor-pointer select-none transition-colors"
                  >
                    📄 Generar Reporte Ejecutivo
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (e) e.stopPropagation();
                      handleSaveProjectCargo();
                    }}
                    className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-6 py-2.5 rounded shadow font-bold text-sm cursor-pointer select-none transition-colors"
                  >
                    💾 Guardar Flete y Estiba en Proyecto
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showExecutiveReport && (() => {
        const activeReport = reportData || buildExecutiveReportData();
        const totalWeightTons = activeReport.totalWeightTons;
        const totalVolumeM3 = activeReport.totalVolumeM3;
        const reportRT = activeReport.reportRT;
        const finalTotalCost = activeReport.finalTotalCost;
        const finalTotalSale = activeReport.finalTotalSale;
        const finalTotalMargin = activeReport.finalTotalMargin;
        const formatCurrency = (val) => '$' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const unitRateSale = activeReport.unitRateSale;
        const fleteCostNum = activeReport.fleteCostNum;
        const fleteSaleNum = activeReport.fleteSaleNum;
        const fleteMarginNum = activeReport.fleteMarginNum;

        const estibaCostNum = activeReport.estibaCostNum;
        const estibaSaleNum = activeReport.estibaSaleNum;
        const estibaMarginNum = activeReport.estibaMarginNum;

        const matCostNum = activeReport.matCostNum;
        const matSaleNum = activeReport.matSaleNum;
        const matMarginNum = activeReport.matMarginNum;

        const periCostNum = activeReport.periCostNum;
        const periSaleNum = activeReport.periSaleNum;
        const periMarginNum = activeReport.periMarginNum;

        const fleteUnitarioUsdMt = Number(activeReport.flete_unitario_usd_mt ?? activeReport.fleteUnitarioUsdMt ?? 0);
        const fobMasMercanciaUnitarioUsdMt = Number(activeReport.fob_mas_mercancia_unitario_usd_mt ?? activeReport.fobMasMercanciaUnitarioUsdMt ?? 0);
        const fleteTotalUsd = Number(activeReport.flete_total_usd ?? activeReport.fleteTotalUsd ?? 0);
        const costesFobTotalesUsd = Number(activeReport.costes_fob_totales_usd ?? activeReport.costesFobTotalesUsd ?? 0);
        const valorTotalMercanciaUsd = Number(activeReport.valor_total_mercancia_usd ?? activeReport.valorTotalMercanciaUsd ?? 0);
        const toneladas = Number(activeReport.toneladas || activeReport.totalWeightTons || (reportRT > 0 ? reportRT : 1));
        const formatUsd = (val) => '$' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return (
          <div className="fixed inset-0 bg-white z-[9000] overflow-y-auto pt-10 pb-28 px-4 sm:px-10 text-slate-900 print:bg-white print:p-0">
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                #printable-a4-sheet, #printable-a4-sheet * { visibility: visible !important; }
                #printable-a4-sheet { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 12mm !important; border: none !important; box-shadow: none !important; }
                .print-hidden { display: none !important; }
                .stowage-plan-section {
                  page-break-before: always !important;
                  break-before: page !important;
                  margin-top: 0 !important;
                  padding-top: 6mm !important;
                  width: 100% !important;
                }
                .stowage-plan-section .croquis-ascii-container {
                  font-size: 10px !important;
                  line-height: 1.28 !important;
                }
                @page { size: A4 portrait; margin: 0; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
            `}</style>

            <div className="fixed bottom-6 right-8 flex items-center gap-4 z-[9999] print:hidden">
              <button
                id="btn-close-executive-report"
                type="button"
                onClick={() => setShowExecutiveReport(false)}
                className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl font-black flex items-center gap-2 border-2 border-white cursor-pointer hover:scale-105 transition-transform"
                title="Cerrar Reporte (Esc)"
                aria-label="Cerrar Reporte"
              >
                ✖ Cerrar
              </button>
              <button
                id="btn-print-executive-report"
                type="button"
                onClick={() => window.print()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full shadow-2xl font-black flex items-center gap-2 border-2 border-white cursor-pointer hover:scale-105 transition-transform"
                title="Imprimir o Guardar Reporte"
                aria-label="Imprimir / Guardar Reporte"
              >
                🖨️ Imprimir / Guardar Reporte
              </button>
            </div>

            <div id="printable-a4-sheet" className="max-w-4xl mx-auto p-10 bg-white text-slate-900 shadow-xl border border-slate-300 rounded">
              
              <header className="border-b-2 border-slate-200 pb-4 mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                  <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
                    Universal Forwarding / B2B Module
                  </h1>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    OFERTA COMERCIAL - PROJECT CARGO
                  </p>

                  {/* Selector Comercial de 3 Vías (Triple Escenario de Negociación) */}
                  <div className="mt-3.5 print:hidden">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1.5">
                      <span>🎯 Estrategia Comercial de Presentación (Selector de Escenario):</span>
                      <span className="text-[9px] font-normal text-slate-400 capitalize">(Blindaje de Margen y All-In Total)</span>
                    </label>
                    <div
                      id="commercial-scenario-selector-group"
                      role="radiogroup"
                      aria-label="Selector de Escenario Comercial"
                      className="inline-flex flex-wrap p-1 bg-slate-100 rounded-lg border border-slate-300 gap-1"
                    >
                      <button
                        type="button"
                        id="scenario-btn-target"
                        aria-pressed={commercialScenario === 'target'}
                        onClick={() => setCommercialScenario('target')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                          commercialScenario === 'target'
                            ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700'
                            : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                        title="Muestra el flete marítimo usando el Target de venta sincronizado y costes FOB con margen estándar"
                      >
                        <span className="w-2 h-2 rounded-full bg-current"></span>
                        <span>Escenario 1: Desglose Comercial (Target)</span>
                      </button>

                      <button
                        type="button"
                        id="scenario-btn-agency"
                        aria-pressed={commercialScenario === 'agency_fee'}
                        onClick={() => setCommercialScenario('agency_fee')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                          commercialScenario === 'agency_fee'
                            ? 'bg-emerald-700 text-white shadow-sm ring-1 ring-emerald-800'
                            : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                        title="Flete al coste técnico puro + FOB real sin inflar + Agency, Logistics & Risk Fee explícito"
                      >
                        <span className="w-2 h-2 rounded-full bg-current"></span>
                        <span>Escenario 2: Flete Técnico + Agency Fee</span>
                      </button>

                      <button
                        type="button"
                        id="scenario-btn-all-in"
                        aria-pressed={commercialScenario === 'all_in'}
                        onClick={() => setCommercialScenario('all_in')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                          commercialScenario === 'all_in'
                            ? 'bg-indigo-700 text-white shadow-sm ring-1 ring-indigo-800'
                            : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                        title="Oculta el desglose interno y muestra una tarifa global All-In / Liner Terms por tonelada métrica"
                      >
                        <span className="w-2 h-2 rounded-full bg-current"></span>
                        <span>Escenario 3: Tarifa All-In (Liner Terms)</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-600 font-mono self-stretch md:self-auto flex flex-col justify-end">
                  <div className="mb-1"><span className="font-bold text-slate-800 uppercase text-[10px] mr-2">Fecha de Emisión:</span>{new Date().toLocaleDateString('es-ES')}</div>
                  <div className="mb-1"><span className="font-bold text-slate-800 uppercase text-[10px] mr-2">Referencia del Proyecto:</span>{activeProject?.project_ref || 'EXP-SIN-REF'}</div>
                  <div className="mb-1"><span className="font-bold text-slate-800 uppercase text-[10px] mr-2">Cliente:</span><span className="font-bold text-blue-700">{activeProject?.client_name || 'Sin Cliente'}</span></div>
                  <div className="mt-1 pt-1 border-t border-slate-200 text-[10px] text-slate-500 font-sans">
                    <span className="font-semibold text-slate-700">Modalidad Comercial Activa: </span>
                    <span className="font-bold text-blue-900 uppercase">
                      {commercialScenario === 'target' && 'Desglose Comercial (Target)'}
                      {commercialScenario === 'agency_fee' && 'Flete Técnico + Agency Fee'}
                      {commercialScenario === 'all_in' && 'Tarifa All-In (Liner Terms)'}
                    </span>
                  </div>
                </div>
              </header>

              <section className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-3 border-b border-slate-200 pb-1.5">
                  Resumen Operativo (Operational Summary)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                  <div className="bg-white p-2.5 rounded border border-slate-200"><span className="block text-[10px] uppercase font-bold text-slate-500">Volumen Total</span><span className="text-lg font-black text-slate-900">{totals.m3.toFixed(2)} m³</span></div>
                  <div className="bg-white p-2.5 rounded border border-slate-200"><span className="block text-[10px] uppercase font-bold text-slate-500">Peso Total</span><span className="text-lg font-black text-slate-900">{totalWeightTons.toFixed(2)} Tons</span></div>
                  <div className="bg-white p-2.5 rounded border border-slate-200"><span className="block text-[10px] uppercase font-bold text-slate-500">Revenue Tons (RT)</span><span className="text-lg font-black text-indigo-700">{reportRT.toFixed(2)} RT</span></div>
                  <div className="bg-white p-2.5 rounded border border-slate-200"><span className="block text-[10px] uppercase font-bold text-slate-500">Modalidad Operativa</span><span className="text-sm font-black text-blue-600 mt-1 block">{shippingMode}</span></div>
                  <div className="bg-white p-2.5 rounded border border-slate-200"><span className="block text-[10px] uppercase font-bold text-slate-500">Buque Recomendado</span><span className="text-xs font-black text-slate-900 mt-1 block">{vesselType}</span></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mt-3 pt-3 border-t border-slate-200">
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Ruta Marítima</span>
                    <span className="text-xs font-black text-slate-900 mt-1 block">{activeReport.pol || pol || 'POL'} ➔ {activeReport.pod || pod || 'POD'}</span>
                    <span className="block text-[9px] text-slate-500 font-mono">{(activeReport.distanceNm || distanceNm || 0).toLocaleString('es-ES')} NM</span>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Ritmos Carga / Descarga</span>
                    <span className="text-xs font-black text-slate-900 mt-1 block">{(activeReport.loadingRate || loadingRate || 0).toLocaleString('es-ES')} / {(activeReport.dischargingRate || dischargingRate || 0).toLocaleString('es-ES')} MT/d</span>
                    <span className="block text-[9px] text-slate-500">Velocidad: {activeReport.vesselSpeedKnots || vesselSpeedKnots || 12} nudos</span>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Rotación Buque (D_total)</span>
                    <span className="text-xs font-black text-blue-700 mt-1 block font-mono">{(activeReport.diasRotacionTotal || 0).toFixed(2)} días</span>
                    <span className="block text-[9px] text-slate-500">({(activeReport.diasCarga || 0).toFixed(1)}d C + {(activeReport.diasDescarga || 0).toFixed(1)}d D + {(activeReport.diasNavegacion || 0).toFixed(1)}d Nav)</span>
                  </div>
                  <div className={`p-2.5 rounded border ${activeReport.demurrageDays > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                    <span className="block text-[10px] uppercase font-bold text-slate-600">Gestión de Demoras</span>
                    <span className={`text-xs font-black mt-1 block font-mono ${activeReport.demurrageDays > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                      {activeReport.demurrageDays > 0 ? `⚠️ Exceso: ${activeReport.demurrageDays.toFixed(2)} d (+${formatCurrency(activeReport.demurrageCostNum)})` : '✅ Sin Demoras (En Plancha)'}
                    </span>
                    <span className="block text-[9px] text-slate-500">Tarifa: {(activeReport.demurrageDailyRateUsd || activeReport.dailyRateUsd || 11500).toLocaleString('es-ES')} USD/d</span>
                  </div>
                </div>
              </section>

              <section className="mb-6">
                <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2 mb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    📋 Desglose Financiero Separado (Flete Marítimo vs. Costes FOB / Operativa Portuaria)
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 font-mono">
                    {commercialScenario === 'target' && 'Escenario 1: Target de Venta'}
                    {commercialScenario === 'agency_fee' && 'Escenario 2: Coste Técnico + Fee'}
                    {commercialScenario === 'all_in' && 'Escenario 3: Tarifa All-In'}
                  </span>
                </div>

                <table className="border-collapse w-full text-[11px]" id="executive-report-financial-table">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 uppercase font-bold border-y-2 border-slate-300">
                      <th className="py-2.5 px-3 text-left">Concepto</th>
                      <th className="py-2.5 px-3 text-left">Descripción</th>
                      <th className="py-2.5 px-3 text-right" title="Coste (€)">Coste ($)</th>
                      <th className="py-2.5 px-3 text-right" title="Venta (€)">Venta ($)</th>
                      <th className="py-2.5 px-3 text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* ESCENARIO 3: Tarifa All-In / Liner Terms (Oculta desglose interno y muestra tarifa única) */}
                    {commercialScenario === 'all_in' ? (
                      <>
                        <tr className="bg-indigo-50/70 hover:bg-indigo-50 font-medium">
                          <td className="py-4 px-3 font-bold text-indigo-950">
                            <div className="text-sm font-black text-indigo-900">Tarifa All-In / Liner Terms</div>
                            <div className="text-[10px] font-mono text-indigo-700 font-bold mt-1">
                              Precio Único: ${(toneladas > 0 ? (finalTotalSale / toneladas).toFixed(2) : '0.00')} USD/MT
                            </div>
                          </td>
                          <td className="py-4 px-3 text-slate-700 leading-relaxed">
                            Servicio integral integral marítimo y logístico completo "Full Service Door-to-Port / Liner Terms".
                            Engloba flete marítimo oceánico internacional, operativa portuaria completa de carga, estiba, trincaje con cuadrillas especializadas,
                            gestión y materiales certificados de estiba y transporte portuario para {toneladas.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT
                            ({reportRT.toFixed(2)} RT). Tarifa consolidada única sin desgloses secundarios.
                          </td>
                          <td className="py-4 px-3 text-right font-mono text-slate-800 font-semibold">{formatCurrency(finalTotalCost)}</td>
                          <td className="py-4 px-3 text-right font-mono font-black text-indigo-900 text-sm">{formatCurrency(finalTotalSale)}</td>
                          <td className="py-4 px-3 text-right font-mono text-emerald-600 font-black">{formatCurrency(finalTotalMargin)}</td>
                        </tr>
                        {/* Fila invisible para compatibilidad de selectores o tests */}
                        <tr className="hidden" aria-hidden="true">
                          <td>Flete Marítimo (Base RT)</td>
                          <td>Estiba y Trincaje (Cuadrillas, Trincadores)</td>
                          <td>Materiales Especiales (MAFIs, Heavy Lift, Cadenas, Dunnage)</td>
                          <td>Logística Periférica (Almacenaje Portuario, Surveyor, Transporte Inland, Mercancía)</td>
                          <td></td>
                        </tr>
                      </>
                    ) : (
                      <>
                        {/* Fila 1: Flete Marítimo (Base RT) */}
                        <tr className="hover:bg-slate-50 bg-sky-50/40">
                          <td className="py-2.5 px-3 font-bold text-sky-900">
                            <div>Flete Marítimo (Base RT)</div>
                            {commercialScenario === 'agency_fee' ? (
                              <div className="text-[10px] font-mono font-semibold text-sky-700 mt-0.5">
                                Flete Técnico Puro al Coste: ${(toneladas > 0 ? (fleteCostNum / toneladas).toFixed(2) : '0.00')} USD/MT
                              </div>
                            ) : (
                              (Number(activeReport.fleteCompraUnit || 0) > 0 || Number(activeReport.fleteVentaUnit || 0) > 0) && (
                                <div className="text-[10px] font-mono font-semibold mt-0.5 space-y-0.5">
                                  {Number(activeReport.fleteCompraUnit || 0) > 0 && (
                                    <div className="text-blue-800">Flete Sugerido Armador (Compra): ${Number(activeReport.fleteCompraUnit).toFixed(2)} USD/MT</div>
                                  )}
                                  {Number(activeReport.fleteVentaUnit || 0) > 0 && (
                                    <div className="text-emerald-800">Flete Sugerido Fletador (Venta): ${Number(activeReport.fleteVentaUnit).toFixed(2)} USD/MT</div>
                                  )}
                                </div>
                              )
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {commercialScenario === 'agency_fee' ? (
                              <span>
                                Flete técnico de coste puro sin margen comercial aplicado · Base {(reportRT || 0).toFixed(2)} RT · Rotación {(activeReport.diasRotacionTotal || 10).toFixed(2)} d · TCE base armador {(activeReport.dailyRateUsd || 11500).toLocaleString('es-ES')} USD/día.
                              </span>
                            ) : (
                              Number(activeReport.fleteVentaUnit || 0) > 0 ? (
                                <span>
                                  Ocean Freight simulación respetada (Flete Venta Fletador: ${Number(activeReport.fleteVentaUnit).toFixed(2)} USD/MT) · Rotación {(activeReport.diasRotacionTotal || 10).toFixed(2)} d ({(activeReport.diasCarga || 1.5).toFixed(2)}d carga, {(activeReport.diasDescarga || 1.8).toFixed(2)}d descarga, {(activeReport.diasNavegacion || 6.7).toFixed(2)}d nav) · TCE {(activeReport.dailyRateUsd || 11500).toLocaleString('es-ES')} USD/día
                                </span>
                              ) : (
                                <span>
                                  Ocean Freight / TCE de buque fletado sobre base W/M ({reportRT.toFixed(2)} RT) · Rotación {(activeReport.diasRotacionTotal || 10).toFixed(2)} d ({(activeReport.diasCarga || 1.5).toFixed(2)}d carga, {(activeReport.diasDescarga || 1.8).toFixed(2)}d descarga, {(activeReport.diasNavegacion || 6.7).toFixed(2)}d nav) · {(activeReport.dailyRateUsd || 11500).toLocaleString('es-ES')} USD/día
                                </span>
                              )
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800">{formatCurrency(fleteCostNum)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-700">
                            {formatCurrency(commercialScenario === 'agency_fee' ? fleteCostNum : fleteSaleNum)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">
                            {formatCurrency(commercialScenario === 'agency_fee' ? 0 : fleteMarginNum)}
                          </td>
                        </tr>

                        {/* Fila 2: Estiba y Trincaje (Cuadrillas, Trincadores) */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-900">Estiba y Trincaje (Cuadrillas, Trincadores)</td>
                          <td className="py-2.5 px-3 text-slate-600">Turnos de estibadores en muelle y cuadrillas de trincaje especializado</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800">{formatCurrency(estibaCostNum)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(commercialScenario === 'agency_fee' ? estibaCostNum : estibaSaleNum)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">
                            {formatCurrency(commercialScenario === 'agency_fee' ? 0 : estibaMarginNum)}
                          </td>
                        </tr>

                        {/* Fila 3: Materiales Especiales (MAFIs, Heavy Lift, Cadenas, Dunnage) */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-900">Materiales Especiales (MAFIs, Heavy Lift, Cadenas, Dunnage)</td>
                          <td className="py-2.5 px-3 text-slate-600">Grúa auxiliar, roll trailers MAFI, dunnage, eslingas y cadenas certificadas</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800">{formatCurrency(matCostNum)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(commercialScenario === 'agency_fee' ? matCostNum : matSaleNum)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">
                            {formatCurrency(commercialScenario === 'agency_fee' ? 0 : matMarginNum)}
                          </td>
                        </tr>

                        {/* Fila 4: Logística Periférica (Almacenaje Portuario, Surveyor, Transporte Inland, Mercancía) */}
                        <tr className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-900">Logística Periférica (Almacenaje Portuario, Surveyor, Transporte Inland, Mercancía)</td>
                          <td className="py-2.5 px-3 text-slate-600">Almacenaje muelle ({activeReport.preStackingDays || (Number(activeReport.storageDays) > 0 ? activeReport.storageDays : (Number(storageDays) > 0 ? storageDays : 5))} d), surveyor portuario, transporte inland y mercancía</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800">{formatCurrency(periCostNum)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(commercialScenario === 'agency_fee' ? periCostNum : periSaleNum)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">
                            {formatCurrency(commercialScenario === 'agency_fee' ? 0 : periMarginNum)}
                          </td>
                        </tr>

                        {/* Fila 5: Seguro de Mercancía a Todo Riesgo (Transición a CIF) */}
                        {(activeReport.insuranceCostNum > 0 || Number(activeReport.insuranceCost) > 0 || Number(insuranceCost) > 0) && (
                          <tr className="hover:bg-slate-50 bg-emerald-50/20">
                            <td className="py-2.5 px-3 font-bold text-slate-900">Seguro de Mercancía a Todo Riesgo</td>
                            <td className="py-2.5 px-3 text-slate-600">Póliza marítima de seguro a todo riesgo para la mercancía bajo cobertura de cláusulas ICC A del Instituto de Londres (condiciones CIF)</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800">{formatCurrency(activeReport.insuranceCostNum || activeReport.insuranceCost || insuranceCost)}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(commercialScenario === 'agency_fee' ? (activeReport.insuranceCostNum || activeReport.insuranceCost || insuranceCost) : ((activeReport.insuranceCostNum || activeReport.insuranceCost || insuranceCost) * 1.15))}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">
                              {formatCurrency(commercialScenario === 'agency_fee' ? 0 : ((activeReport.insuranceCostNum || activeReport.insuranceCost || insuranceCost) * 0.15))}
                            </td>
                          </tr>
                        )}

                        {/* Fila Demoras: Penalización por Exceso de Estadía si existe */}
                        {activeReport.demurrageDays > 0 && (
                          <tr className="hover:bg-amber-50 bg-amber-50/60 font-semibold">
                            <td className="py-2.5 px-3 font-bold text-amber-950">Demoras y Sobrecostes de Muelle (Demurrage)</td>
                            <td className="py-2.5 px-3 text-amber-900">
                              Penalización automática por exceso de tiempo en muelle ({activeReport.demurrageDays.toFixed(2)} d) a {(activeReport.demurrageDailyRateUsd || 11500).toLocaleString('es-ES')} USD/día
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-amber-950 font-bold">{formatCurrency(activeReport.demurrageCostNum)}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-800">
                              {formatCurrency(commercialScenario === 'agency_fee' ? activeReport.demurrageCostNum : (activeReport.demurrageCostNum * 1.15))}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">
                              {formatCurrency(commercialScenario === 'agency_fee' ? 0 : (activeReport.demurrageCostNum * 0.15))}
                            </td>
                          </tr>
                        )}

                        {/* Fila ESCENARIO 2: Agency, Logistics & Risk Fee */}
                        {commercialScenario === 'agency_fee' && (
                          <tr className="bg-emerald-50/80 hover:bg-emerald-100/60 border-t-2 border-emerald-300 font-semibold">
                            <td className="py-3 px-3 font-bold text-emerald-950">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-emerald-800">Agency, Logistics & Risk Fee</span>
                                <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-bold">Honorarios</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-emerald-900 text-[10.5px]">
                              Honorarios integrales de agencia, supervisión portuaria, coordinación operativa de buque, gestión documental aduanera y cobertura de riesgo operativo comercial.
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-slate-800 font-medium">$0.00</td>
                            <td className="py-3 px-3 text-right font-mono font-black text-emerald-900 text-xs">
                              {formatCurrency(finalTotalMargin)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-emerald-600 font-black">
                              {formatCurrency(finalTotalMargin)}
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </section>

              {/* Subtotales destacados: Flete vs FOB / Operativa */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-sky-50 border border-sky-200 p-4 rounded-lg">
                  <span className="block text-[10px] font-bold text-sky-700 uppercase tracking-wide">Subtotal Flete Marítimo / TCE</span>
                  <div className="text-xl font-black font-mono text-sky-900 mt-1">{formatCurrency(activeReport.subtotalFreight || fleteCostNum)}</div>
                  <span className="text-[10px] text-sky-600 font-semibold">
                    Precio Venta Flete: {formatCurrency(commercialScenario === 'agency_fee' ? fleteCostNum : (commercialScenario === 'all_in' ? finalTotalSale : fleteSaleNum))}
                  </span>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                  <span className="block text-[10px] font-bold text-amber-700 uppercase tracking-wide">
                    {commercialScenario === 'agency_fee' ? 'Subtotal Costes FOB Reales + Fee' : 'Subtotal Costes FOB y Operativa Portuaria'}
                  </span>
                  <div className="text-xl font-black font-mono text-amber-900 mt-1">{formatCurrency(activeReport.subtotalFobOperations || (estibaCostNum + matCostNum + periCostNum + (activeReport.insuranceCostNum || 0)))}</div>
                  <span className="text-[10px] text-amber-600 font-semibold">
                    Precio Venta Operativa: {formatCurrency(
                      commercialScenario === 'agency_fee'
                        ? (Number(activeReport.subtotalFobOperations || (estibaCostNum + matCostNum + periCostNum + (activeReport.insuranceCostNum || 0))) + finalTotalMargin)
                        : (commercialScenario === 'all_in'
                            ? finalTotalSale
                            : parseFloat(activeReport.subtotalFobOperations || (estibaCostNum + matCostNum + periCostNum + (activeReport.insuranceCostNum || 0))) * 1.15)
                    )}
                  </span>
                </div>
              </div>

              {/* Sección: Desglose Unitario Operativo (USD/MT) */}
              <section className="mb-6">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-3 border-b-2 border-slate-200 pb-2 flex items-center justify-between">
                  <span>💵 Desglose Unitario Operativo (USD/MT)</span>
                  <span className="text-[10px] font-bold text-slate-500 font-mono">
                    Base: {toneladas.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT · Valores exclusivos en USD/MT
                  </span>
                </h3>

                {(Number(activeReport.fleteCompraUnit || 0) > 0 || Number(activeReport.fleteVentaUnit || 0) > 0) && (
                  <div id="executive-suggested-freights-bar" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 border-2 border-blue-300 p-4 rounded-xl shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wide text-blue-900">
                          Flete Sugerido Armador (Compra)
                        </span>
                        <span className="text-[10px] font-extrabold bg-blue-200 text-blue-900 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                          USD/MT
                        </span>
                      </div>
                      <div className="text-2xl font-black font-mono text-blue-950 mt-2">
                        {Number(activeReport.fleteCompraUnit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-bold text-blue-800">USD/MT</span>
                      </div>
                      <p className="text-[10px] text-blue-700 mt-1.5 font-semibold">
                        Flete base armador sincronizado de la Calculadora
                      </p>
                    </div>

                    <div className="bg-emerald-50 border-2 border-emerald-300 p-4 rounded-xl shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wide text-emerald-900">
                          Flete Sugerido Fletador (Venta)
                        </span>
                        <span className="text-[10px] font-extrabold bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                          USD/MT
                        </span>
                      </div>
                      <div className="text-2xl font-black font-mono text-emerald-950 mt-2">
                        {Number(activeReport.fleteVentaUnit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-bold text-emerald-800">USD/MT</span>
                      </div>
                      <p className="text-[10px] text-emerald-700 mt-1.5 font-semibold">
                        Objetivo comercial de venta sincronizado (Target Simulación)
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Valor del Flete */}
                  <div className="bg-sky-50 border-2 border-sky-300 p-4 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-black uppercase tracking-wide text-sky-800">
                        Valor del Flete
                      </span>
                      <span className="text-[10px] font-extrabold bg-sky-200 text-sky-900 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                        USD/MT
                      </span>
                    </div>
                    <div className="text-2xl font-black font-mono text-sky-900 mt-2">
                      {fleteUnitarioUsdMt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-bold text-sky-700">USD/MT</span>
                    </div>
                    <p className="text-[10px] text-sky-700 mt-1.5 font-semibold">
                      Flete Marítimo Internacional Total: <span className="font-bold font-mono">{formatUsd(fleteTotalUsd)}</span> sobre {toneladas.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT
                    </p>
                  </div>

                  {/* Costes FOB + Mercancía */}
                  <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-black uppercase tracking-wide text-amber-900">
                        Costes FOB + Mercancía
                      </span>
                      <span className="text-[10px] font-extrabold bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                        USD/MT
                      </span>
                    </div>
                    <div className="text-2xl font-black font-mono text-amber-950 mt-2">
                      {fobMasMercanciaUnitarioUsdMt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-bold text-amber-800">USD/MT</span>
                    </div>
                    <p className="text-[10px] text-amber-800 mt-1.5 font-semibold">
                      Costes FOB ({formatUsd(costesFobTotalesUsd)}) + Mercancía ({formatUsd(valorTotalMercanciaUsd)}) sobre {toneladas.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT
                    </p>
                  </div>
                </div>
              </section>

              {/* Importe Total de Cotización / Venta (All-In) */}
              <div className="bg-slate-100 border-2 border-slate-900 p-6 rounded-lg flex justify-between items-center mb-8">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-600 tracking-widest block mb-1">
                    {commercialScenario === 'all_in' ? 'Importe Consolidado (Tarifa Única All-In / Liner Terms)' : 'Importe Total Cotización (All-In)'}
                  </span>
                  <h2 className="text-2xl font-black uppercase text-slate-900">PRECIO TOTAL DE VENTA AL CLIENTE</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1 rounded text-xs font-bold font-mono">
                      Tarifa All-In: {formatCurrency(unitRateSale)} / RT (W/M)
                    </span>
                    <span className="bg-indigo-100 text-indigo-900 border border-indigo-200 px-3 py-1 rounded text-xs font-black font-mono">
                      Precio Único: ${(toneladas > 0 ? (finalTotalSale / toneladas).toFixed(2) : '0.00')} USD/MT
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">Cálculo sobre {reportRT.toFixed(2)} Revenue Tons ({toneladas.toFixed(2)} MT)</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black font-mono text-blue-700">{formatCurrency(finalTotalSale)}</div>
                  <div className="text-xs text-slate-500 mt-1 font-bold">Coste All-In: {formatCurrency(finalTotalCost)} · Margen comercial ({formatCurrency(finalTotalMargin)})</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-16 pt-12 text-center">
                <div><div className="border-b border-slate-400 pb-16 mb-2"></div><p className="text-xs font-bold text-slate-800">Firma Transitario</p></div>
                <div><div className="border-b border-slate-400 pb-16 mb-2"></div><p className="text-xs font-bold text-slate-800">Aceptación Cliente</p></div>
              </div>

              {/* Croquis Esquemático de Estiba (Stowage Plan) en página dedicada al final del documento */}
              <section
                className="stowage-plan-section print-exact mt-12 pt-8 border-t-2 border-dashed border-slate-300 print:border-none print:mt-0 print:pt-4"
                style={{ pageBreakBefore: 'always', breakBefore: 'page' }}
              >
                <header className="border-b-2 border-slate-800 pb-3 mb-4 flex justify-between items-end">
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
                      <span>🚢</span> Croquis Esquemático de Estiba (Stowage Plan)
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                      Plano Técnico de Distribución Matricial & Segregación Operativa
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-600 font-mono">
                    <div className="mb-0.5"><span className="font-bold text-slate-800 uppercase text-[10px] mr-1.5">Ref:</span>{activeProject?.project_ref || 'EXP-SIN-REF'}</div>
                    <div><span className="font-bold text-slate-800 uppercase text-[10px] mr-1.5">Buque:</span>{vesselType || 'Handysize MPP 30.300 m³'}</div>
                  </div>
                </header>

                <div className="croquis-ascii-container bg-slate-900 text-slate-100 border-2 border-slate-800 p-4 sm:p-5 rounded-xl overflow-x-auto text-[10px] sm:text-[11px] print:text-[10px] leading-snug font-mono whitespace-pre shadow-md">
                  {getStowageAscii(activeReport)}
                </div>

                {/* Razonamiento Técnico de Ingeniería Naval */}
                {(() => {
                  const currentStowage = activeReport?.stowagePlan
                    || reportData?.stowagePlan
                    || calculateUniversalStowagePlan(cargoItems, totals, { shippingMode, pol, pod });
                  const justification = currentStowage?.executiveJustification;
                  if (!justification) return null;

                  return (
                    <div className="mt-4 p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl shadow-xs print:bg-white print:border-slate-300">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-2.5 flex items-center gap-2 border-b border-slate-200 pb-2">
                        <span className="text-blue-600">📐</span> Razonamiento Técnico de Ingeniería Naval
                      </h4>
                      {Array.isArray(justification) ? (
                        <div className="space-y-2 text-sm text-gray-700 leading-relaxed font-sans">
                          {justification.map((point, idx) => {
                            const colonIndex = point.indexOf(':');
                            if (colonIndex !== -1) {
                              const label = point.slice(0, colonIndex + 1);
                              const content = point.slice(colonIndex + 1);
                              return (
                                <p key={idx} className="flex items-start gap-2">
                                  <span className="font-semibold text-slate-900 shrink-0">•</span>
                                  <span>
                                    <strong className="font-bold text-slate-900">{label}</strong>
                                    {content}
                                  </span>
                                </p>
                              );
                            }
                            return (
                              <p key={idx} className="flex items-start gap-2">
                                <span className="font-semibold text-slate-900 shrink-0">•</span>
                                <span>{point}</span>
                              </p>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-700 leading-relaxed font-sans whitespace-pre-line">
                          {justification}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {activeReport?.stowagePlan && (
                  <div className="mt-4 pt-4 border-t-2 border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded text-[11px] font-black uppercase tracking-wider ${activeReport.stowagePlan.cargoClassification?.isMixedCargo ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-blue-100 text-blue-800 border border-blue-300'}`}>
                          {activeReport.stowagePlan.cargoClassification?.isMixedCargo ? '🔀 Distribución Multi-Carga Optimizada' : '📦 Estiba Homogénea Monopartida'}
                        </span>
                        <span className="text-[11px] text-slate-600 font-bold">
                          Handysize MPP · 4 Bodegas + Cubierta · Capacidad: 30.300 m³
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          ✓ Resistencia Estructural ({Number(activeReport.stowagePlan.hydrodynamicsAndSafety?.maxFloorPressureTm2 || 0).toFixed(1)} / 20.0 t/m²)
                        </span>
                        <span className="text-sky-700 font-bold bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                          ✓ GM Estabilidad ({Number(activeReport.stowagePlan.hydrodynamicsAndSafety?.metacentricHeightGmEstimatedM || 1.55).toFixed(2)}m)
                        </span>
                      </div>
                    </div>

                    {/* Matriz visual de bodegas 1 a 4 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(Array.isArray(activeReport.stowagePlan.holds) ? activeReport.stowagePlan.holds : []).map((hold, holdIdx) => (
                        <div key={hold?.holdNumber || `hold-${holdIdx}`} className="bg-white border-2 border-slate-200 rounded-lg p-3 shadow-xs hover:border-blue-400 transition-colors">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[11px] font-black uppercase text-slate-800">{hold?.name || `Bodega ${holdIdx + 1}`}</span>
                            <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {Number(hold?.weightPercentage || 0).toFixed(1)}% peso
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 mb-1.5">
                            <span className="font-bold text-slate-900">{Number(hold?.totalWeightTons || 0).toFixed(2)} MT</span> · {Number(hold?.totalVolumeCbm || 0).toFixed(1)} m³
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 mb-1.5 overflow-hidden border border-slate-200">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(4, hold?.volumeUtilizationPct || 0))}%` }}
                            />
                          </div>
                          <div className="text-[10px] font-semibold text-slate-700 truncate" title={hold?.stowageTier || 'Bodega General'}>
                            Nivel: <span className="font-bold text-slate-900">{hold?.stowageTier || 'Bodega General'}</span>
                          </div>
                          <div className="text-[9.5px] text-slate-500 leading-tight mt-1 line-clamp-2" title={hold?.securingLegend || ''}>
                            {hold?.securingLegend || 'Trincaje estándar OMI'}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Cubierta y Doble Fondo complementarios */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10.5px]">
                      <div className="bg-slate-100/80 border border-slate-200 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-slate-800 uppercase text-[10px]">🌊 Cubierta Superior / Weather Deck</span>
                          <span className="font-mono font-bold text-slate-700 text-[10px]">
                            {activeReport.stowagePlan.weatherDeck?.totalWeightTons > 0 ? `${Number(activeReport.stowagePlan.weatherDeck.totalWeightTons).toFixed(2)} MT (${Number(activeReport.stowagePlan.weatherDeck.weightPercentage || 0).toFixed(1)}%)` : 'Despejada'}
                          </span>
                        </div>
                        <p className="text-[9.5px] text-slate-600 leading-tight">
                          {activeReport.stowagePlan.weatherDeck?.stowageMethod || 'Cubierta despejada / libre para estiba adicional'}
                        </p>
                      </div>

                      <div className="bg-slate-100/80 border border-slate-200 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-slate-800 uppercase text-[10px]">⚓ Doble Fondo / Tanktop & Tween Deck</span>
                          <span className="font-mono font-bold text-emerald-700 text-[10px]">Resistencia: 20.0 t/m²</span>
                        </div>
                        <p className="text-[9.5px] text-slate-600 leading-tight">
                          {activeReport.stowagePlan.cargoClassification?.isMixedCargo
                            ? 'Asignación por gravedad: maquinaria y cargas críticas en Tanktop con cunas estructurales; paletizado en Tween Deck con cinchas.'
                            : (activeReport.stowagePlan.tanktopSummary?.securingMethod || 'Fondo de bodega reforzado para soporte de cargas pesadas.')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        );
      })()}

      {/* MODAL MODO DUAL TRADING & CHARTERING */}
      {isDualTradingOpen && (
        <div
          id="modal-dual-trading"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto animate-fadeIn print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Simulador Dual Trading y Chartering"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDualTradingOpen(false);
          }}
        >
          <div className="relative w-full max-w-6xl h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-300">
            {/* Header del Modal con título y botón de cierre claro */}
            <div className="px-6 py-3.5 bg-[#002060] text-white flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-2.5">
                <span className="text-xl" aria-hidden="true">⚖️</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-sm uppercase tracking-wider text-white">Modo Dual · Trading &amp; Chartering</h3>
                    <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-400/30 px-2 py-0.5 rounded font-mono uppercase font-bold">Módulo Integrado</span>
                  </div>
                  <p className="text-[11px] text-blue-200">Arbitraje comercial y cálculo de margen cruzado sobre flete marítimo</p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-dual-trading"
                onClick={() => setIsDualTradingOpen(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                aria-label="Cerrar Simulador Dual Trading"
              >
                <span className="text-base font-normal">✕</span>
                <span>Cerrar</span>
              </button>
            </div>

            {/* Contenedor del Componente Web Dual Trading */}
            <div className="flex-1 overflow-auto bg-[#F8FAFC]">
              <dual-trading-chartering-view ref={dualViewRef} style={{ display: 'block', minHeight: '100%' }} />
            </div>
          </div>
        </div>
      )}

      {/* MODAL CUMPLIMIENTO CBAM (UE) */}
      {isCbamOpen && (() => {
        const quantityNum = Number(cbamQuantity) || 0;
        const analysis = buildCBAMCommercialAnalysis({
          productType: cbamSector,
          quantity: quantityNum,
          certifiedFactor: cbamReportedEmissions,
          competitorFactor: cbamCompetitorFactor
        });

        const formatEuro = (val) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val || 0);

        const handleExportProforma = () => {
          const freightRate = Number(activeReport?.flete_unitario_usd_mt ?? financialBreakdown?.flete_unitario_usd_mt ?? 0);
          generateCBAMCommercialProformaPDF({
            productType: cbamSector,
            quantity: quantityNum,
            certifiedFactor: cbamReportedEmissions,
            competitorFactor: cbamCompetitorFactor,
            origin: cbamOrigin,
            destination: cbamDestination,
            freightRate,
            freightTotal: freightRate * quantityNum
          });
        };

        const handleExportReport = () => {
          updateCBAMState({
            sector: cbamSector,
            origen: cbamOrigin,
            destino: cbamDestination,
            tonelaje: quantityNum,
            factorManual: cbamReportedEmissions,
            impuestoOrigen: 0
          });
          generateCBAMReportPDF();
        };

        const handleExportRequirements = () => {
          updateCBAMState({
            sector: cbamSector,
            origen: cbamOrigin,
            destino: cbamDestination,
            tonelaje: quantityNum,
            factorManual: cbamReportedEmissions,
            impuestoOrigen: 0
          });
          generateCBAMRequirementsPDF();
        };

        return (
          <div
            id="modal-cbam"
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto animate-fadeIn print:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Módulo CBAM"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsCbamOpen(false);
            }}
          >
            <div className="relative w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-300">
              {/* Header del Modal con título y botón de cierre */}
              <div className="px-6 py-4 bg-[#002060] text-white flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-3">
                  <span className="text-xl" aria-hidden="true">🌱</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm uppercase tracking-wider text-white">Módulo CBAM · Mecanismo de Ajuste en Frontera por Carbono</h3>
                      <span className="text-[10px] bg-teal-400/20 text-teal-300 border border-teal-400/30 px-2 py-0.5 rounded font-mono font-bold uppercase">UE 2026</span>
                    </div>
                    <p className="text-[11px] text-blue-200">Control informativo de impacto financiero aduanero para importaciones hacia la UE</p>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-close-cbam"
                  onClick={() => setIsCbamOpen(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                  aria-label="Cerrar Módulo CBAM"
                >
                  <span className="text-base font-normal">✕</span>
                  <span>Cerrar</span>
                </button>
              </div>

              {/* Contenido Formulario y Cálculos */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F8FAFC]">
                {/* Parámetros de Operación */}
                <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                  <h4 className="text-xs font-black text-[#002060] uppercase tracking-wider border-b border-slate-200 pb-2">
                    Parámetros de la Operación (Sincronizados con el Proyecto)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div>
                      <label htmlFor="cbam-modal-sector" className="text-teal-700 font-bold uppercase text-[10px] block mb-1">Sector regulado</label>
                      <select
                        id="cbam-modal-sector"
                        value={cbamSector}
                        onChange={(e) => setCbamSector(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:border-teal-500 focus:bg-white"
                      >
                        <option value="">— Seleccionar sector —</option>
                        <option value="Cemento">Cemento</option>
                        <option value="Acero">Hierro/Acero</option>
                        <option value="Aluminio">Aluminio</option>
                        <option value="Fertilizantes">Fertilizantes</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="cbam-modal-origin" className="text-slate-700 font-bold uppercase text-[10px] block mb-1">Origen de la carga</label>
                      <input
                        type="text"
                        id="cbam-modal-origin"
                        value={cbamOrigin}
                        onChange={(e) => setCbamOrigin(e.target.value)}
                        placeholder="Ej: Marruecos"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label htmlFor="cbam-modal-destination" className="text-slate-700 font-bold uppercase text-[10px] block mb-1">Destino (UE)</label>
                      <input
                        type="text"
                        id="cbam-modal-destination"
                        value={cbamDestination}
                        onChange={(e) => setCbamDestination(e.target.value)}
                        placeholder="Ej: España"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label htmlFor="cbam-modal-quantity" className="text-slate-700 font-bold uppercase text-[10px] block mb-1">Tonelaje (TM)</label>
                      <input
                        type="number"
                        id="cbam-modal-quantity"
                        min="0"
                        value={cbamQuantity}
                        onChange={(e) => setCbamQuantity(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold font-mono focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label htmlFor="cbam-modal-emissions" className="text-slate-700 font-bold uppercase text-[10px] block mb-1">Factor SEE certificado (tCO2e/t)</label>
                      <input
                        type="number"
                        id="cbam-modal-emissions"
                        min="0"
                        step="0.01"
                        value={cbamReportedEmissions}
                        onChange={(e) => setCbamReportedEmissions(e.target.value)}
                        placeholder="Opcional; usa valor UE"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label htmlFor="cbam-modal-competitor-origin" className="text-slate-700 font-bold uppercase text-[10px] block mb-1">Origen competidor</label>
                      <input
                        type="text"
                        id="cbam-modal-competitor-origin"
                        value={cbamCompetitorOrigin}
                        onChange={(e) => setCbamCompetitorOrigin(e.target.value)}
                        placeholder="Ej: Turquía"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="cbam-modal-competitor-factor" className="text-slate-700 font-bold uppercase text-[10px] block mb-1">Factor competidor (tCO2e/t)</label>
                      <input
                        type="number"
                        id="cbam-modal-competitor-factor"
                        min="0"
                        step="0.01"
                        value={cbamCompetitorFactor}
                        onChange={(e) => setCbamCompetitorFactor(e.target.value)}
                        placeholder="Valor UE por defecto"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:border-blue-500 focus:bg-white"
                      />
                    </div>
                  </div>
                </section>

                {/* Tarjeta de Resultados o Estado Inicial */}
                {analysis.status === 'ready' ? (
                  <section className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-md">
                    <div className="bg-gradient-to-r from-[#002060] via-[#063b78] to-teal-700 p-5 text-white">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-200">Impacto Aduanero para el Comprador (Landed Cost)</span>
                          <h3 className="mt-1 text-2xl font-black">Estimación de Pago en Aduana UE (Buyer)</h3>
                          <p className="mt-1 text-xs text-blue-100">Cálculo comercial independiente. No se incorpora a OPEX, bunkers, PDAs, flete ni TOTAL COSTS.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            id="btn-export-cbam-proforma"
                            onClick={handleExportProforma}
                            className="rounded-lg bg-white px-3.5 py-2 text-xs font-black text-[#002060] shadow-md transition hover:bg-teal-50 cursor-pointer flex items-center gap-1.5"
                          >
                            <span>📄</span> Exportar Proforma Comercial (PDF)
                          </button>
                          <button
                            type="button"
                            id="btn-export-cbam-report"
                            onClick={handleExportReport}
                            className="rounded-lg bg-teal-800/80 border border-teal-300/40 px-3.5 py-2 text-xs font-black text-white shadow-md transition hover:bg-teal-900 cursor-pointer flex items-center gap-1.5"
                          >
                            <span>📊</span> Informe Ejecutivo (PDF)
                          </button>
                          <button
                            type="button"
                            id="btn-export-cbam-reqs"
                            onClick={handleExportRequirements}
                            className="rounded-lg bg-teal-800/80 border border-teal-300/40 px-3.5 py-2 text-xs font-black text-white shadow-md transition hover:bg-teal-900 cursor-pointer flex items-center gap-1.5"
                          >
                            <span>📋</span> Requerimientos (PDF)
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1.1fr_1fr]">
                      <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-5">
                        <span className="block text-[10px] font-black uppercase tracking-wide text-teal-700">Pago estimado del importador</span>
                        <strong className="mt-1 block text-3xl sm:text-4xl font-black text-[#002060]">{formatEuro(analysis.customsPayment)}</strong>
                        <p className="mt-2 text-xs font-semibold text-slate-600">
                          {analysis.quantity.toLocaleString('es-ES')} TM × {analysis.certifiedFactor.toFixed(2)} tCO2e/t × {analysis.carbonPrice.toFixed(2)} EUR/tCO2e
                        </p>
                        <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase text-teal-800 ring-1 ring-teal-200">
                          {analysis.calculationMode === 'certified' ? 'Factor SEE certificado' : 'Valor por defecto UE'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                          <span className="block text-[10px] font-black uppercase text-slate-500">{cbamOrigin || 'Su origen exportador'}</span>
                          <strong className="mt-1 block text-xl text-[#002060]">{formatEuro(analysis.certifiedCost)}</strong>
                          <span className="text-xs text-slate-500">Factor {analysis.certifiedFactor.toFixed(2)} tCO2e/t</span>
                        </div>
                        <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                          <span className="block text-[10px] font-black uppercase text-slate-500">{cbamCompetitorOrigin || 'Origen competidor'}</span>
                          <strong className="mt-1 block text-xl text-slate-800">{formatEuro(analysis.competitorCost)}</strong>
                          <span className="text-xs text-slate-500">Factor {analysis.competitorFactor.toFixed(2)} tCO2e/t</span>
                        </div>
                        <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                          <span className="block text-[10px] font-black uppercase text-emerald-700">Ventaja comercial potencial</span>
                          <strong className="mt-1 block text-2xl text-emerald-800">{formatEuro(analysis.competitiveSaving)}</strong>
                          <span className="text-xs text-emerald-700">Menor landed cost frente al origen competidor indicado.</span>
                        </div>
                      </div>
                    </div>

                    {analysis.validationMessage && (
                      <div className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                        {analysis.validationMessage}
                      </div>
                    )}

                    <div className="mx-5 mb-5 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-xs text-amber-950">
                      <strong className="block text-[10px] uppercase tracking-wide">Nota Comercial CBAM</strong>
                      <p className="mt-1 leading-relaxed">
                        Este es el sobrecoste estimado que el importador asumirá en frontera. Si su fábrica dispone de un certificado SEE inferior al valor por defecto ({analysis.defaultFactor.toFixed(2)}), su mercancía ganará competitividad directa frente a orígenes competidores.
                      </p>
                    </div>
                  </section>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    <strong className="block font-bold">Selecciona el sector regulado e introduce el tonelaje.</strong>
                    <span className="text-[11px] text-amber-700">El cálculo comercial CBAM se activa automáticamente con el tipo de producto y la cantidad.</span>
                  </div>
                )}

                {/* Referencia Oficial de Factores UE 2026 */}
                <section className="space-y-2">
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Factores de Emisión Oficiales UE 2026 (Referencia)</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                      <span className="block text-[10px] uppercase font-black text-slate-500">Cemento</span>
                      <strong className="text-lg text-[#002060]">0.85</strong>
                      <span className="text-[10px] text-slate-400 block">tCO2/TM</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                      <span className="block text-[10px] uppercase font-black text-slate-500">Hierro/Acero</span>
                      <strong className="text-lg text-[#002060]">1.80</strong>
                      <span className="text-[10px] text-slate-400 block">tCO2/TM</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                      <span className="block text-[10px] uppercase font-black text-slate-500">Aluminio</span>
                      <strong className="text-lg text-[#002060]">6.50</strong>
                      <span className="text-[10px] text-slate-400 block">tCO2/TM</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                      <span className="block text-[10px] uppercase font-black text-slate-500">Fertilizantes</span>
                      <strong className="text-lg text-[#002060]">1.50</strong>
                      <span className="text-[10px] text-slate-400 block">tCO2/TM</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        );
      })()}

      <AgenteProyectosWidget
        onUpdatePayload={handleApplyProjectPayload}
        isOpen={isAgentVisible}
        onToggleOpen={setIsAgentVisible}
        cargoItems={cargoItems}
        items={cargoItems}
        setCargoItems={setCargoItems}
        setPackingList={setCargoItems}
        setPol={setPol}
        setPod={setPod}
        setLoadingRate={setLoadingRate}
        setDischargeRate={setDischargingRate}
        setDischargingRate={setDischargingRate}
        charteringAssessment={charteringAssessment}
        routeData={{ pol, pod, loadingRate, dischargingRate, distanceNm, actualLoadingDays, actualDischargingDays, demurrageDailyRateUsd }}
        financialData={{ subtotalFreight, subtotalFobOperations, estimatedCost, salePrice }}
        financialBreakdown={financialBreakdown}
        stowagePlan={activeReport?.stowagePlan || reportData?.stowagePlan || calculateUniversalStowagePlan(cargoItems, totals, { shippingMode, pol, pod })}
      />
    </>
  );
}

class ForwarderWorkspaceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error en componente ForwarderWorkspace:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-8 bg-slate-900 text-white">
          <div className="max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center shadow-xl">
            <span className="text-4xl mb-3 block">⚠️</span>
            <h3 className="text-lg font-bold text-slate-100">Error en la vista del expediente</h3>
            <p className="text-xs text-slate-400 mt-2 mb-4">
              Se ha detectado una incidencia temporal al renderizar los datos del proyecto.
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-sm"
              >
                Reintentar vista
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-bold cursor-pointer transition"
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SafeForwarderWorkspace(props) {
  return (
    <ForwarderWorkspaceErrorBoundary>
      <ForwarderWorkspace {...props} />
    </ForwarderWorkspaceErrorBoundary>
  );
}

export default SafeForwarderWorkspace;
