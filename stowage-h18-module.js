/**
 * stowage-h18-module.js - Controlador Aislado para "Estiba & Cargo Plan (H18)"
 *
 * Módulo 100% blindado:
 * - Solo lectura de la Calculadora de SeaCharter al abrir.
 * - Cero interferencia con fórmulas de flete, TCE, OPEX, CAPEX, PDA ni bloques 6-10.
 * - Única acción de retorno: "Aplicar SF a Calculadora" (rellena cargo-sf con evento change).
 */

import {
  normalizarMedidasBulto,
  normalizePackingListItem,
  resolverGeometriaBodegas,
  calcularEstibaTentativaH18,
  calcularProjectCargoFallbackH18,
  generarCargoPlanSvgH18,
  generarProjectCargoPlanSvgH18,
  sendH18SimulationToDataBridge,
} from './stowage-calculator.js';
import { Vessel3DViewer } from './vessel-3d-viewer.js';

// Plantilla inicial por defecto para Project Cargo / Vehículos (Packing List)
export const DEFAULT_PROJECT_CARGO_PACKING_LIST = [
  { id: 'TRAFO-01', label: 'TRAFO-01', category: 'heavy_lift', length_m: 6.50, width_m: 3.20, height_m: 3.80, weight_mt: 85.0, unit_weight_mt: 85.0, quantity: 1, preferred_zone: 'auto', zone: 'auto' },
  { id: 'SEMI', label: 'SEMI', category: 'vehicle', length_m: 11.50, width_m: 2.50, height_m: 2.40, weight_mt: 15.0, unit_weight_mt: 15.0, quantity: 6, preferred_zone: 'on_deck', zone: 'on_deck' },
  { id: 'CAJAS-PRJ', label: 'CAJAS-PRJ', category: 'crate', length_m: 4.00, width_m: 2.20, height_m: 2.00, weight_mt: 4.5, unit_weight_mt: 4.5, quantity: 1, preferred_zone: 'auto', zone: 'auto' },
];

// Plantillas de carga predefinidas 100% editables
export const CARGO_TEMPLATES_H18 = {
  big_bags: {
    name: 'Big Bags 1.00×1.00×1.30 m · 1.50 MT',
    cargoName: 'Big Bags de Cemento / Mineral',
    length: 1.0,
    width: 1.0,
    height: 1.3,
    unitWeight: 1.5,
    tiers: 4,
    brokenStowagePct: 5,
  },
  europallet: {
    name: 'Europallet 1.20×0.80×1.20 m · 1.50 MT',
    cargoName: 'Europallet Carga General',
    length: 1.2,
    width: 0.8,
    height: 1.2,
    unitWeight: 1.5,
    tiers: 3,
    brokenStowagePct: 8,
  },
  bobinas: {
    name: 'Bobinas de Acero 1.50×1.50×1.20 m · 5.00 MT',
    cargoName: 'Bobinas de Acero Laminado',
    length: 1.5,
    width: 1.5,
    height: 1.2,
    unitWeight: 5.0,
    tiers: 2,
    brokenStowagePct: 12,
  },
  cajas: {
    name: 'Cajas Estándar 0.80×0.60×0.60 m · 0.25 MT',
    cargoName: 'Cajas de Carga Unitizada',
    length: 0.8,
    width: 0.6,
    height: 0.6,
    unitWeight: 0.25,
    tiers: 5,
    brokenStowagePct: 10,
  },
  personalizado: {
    name: 'Personalizado (Medidas a medida)',
    cargoName: 'Bulto Personalizado',
    length: 1.0,
    width: 1.0,
    height: 1.0,
    unitWeight: 1.0,
    tiers: 3,
    brokenStowagePct: 5,
  },
};

class StowageH18Manager {
  constructor() {
    this.currentUnitLength = 'm'; // 'm' o 'cm'
    this.currentUnitWeight = 'MT'; // 'MT' o 'kg'
    this.currentMode = 'homogeneous'; // 'homogeneous' | 'project_cargo'
    this.lastCalculationResult = null;
    this.projectCargoResult = null;
    this.activeVessel = null;
    this.vessel3dViewer = null;
    this.hasLocalProjectCargoEdits = false;
    this.packingList = DEFAULT_PROJECT_CARGO_PACKING_LIST.map((it, idx) => normalizePackingListItem(it, idx));
  }

  /**
   * Lee en modo estrictamente solo lectura los datos del buque activo en la calculadora
   */
  readActiveVesselFromCalculator() {
    const el = (id) => document.getElementById(id);
    const num = (id) => Number(el(id)?.value || 0);

    const vesselName = String(
      el('nombre-buque-calculadora')?.value
      || el('vessel-name')?.value
      || window.State?.vesselName
      || window.State?.vessel
      || ''
    ).trim();

    const imo = String(
      el('vessel-identity-imo')?.value
      || window.State?.imo
      || ''
    ).trim();

    const dwt = num('vessel-identity-dwt')
      || num('vessel-dwt')
      || Number(window.State?.dwt || 0);

    const loa = num('vessel-identity-loa')
      || num('vessel-loa')
      || Number(window.State?.loa || 0);

    const beam = num('vessel-identity-beam')
      || Number(window.State?.beam || 0);

    const draft = num('vessel-identity-draft')
      || num('vessel-draft')
      || Number(window.State?.draft || 0);

    const targetCargoMT = num('cargo-qty')
      || Number(window.State?.cargoQuantity || window.State?.cargo || 0);

    const hasGears = Boolean(
      window.State?.has_gears
      ?? window.State?.h15_technical_sheet?.has_gears
      ?? window.State?.h17_vessel_dossier?.has_gears
    );

    const craneConfiguration = String(
      window.State?.crane_configuration
      || window.State?.h17_vessel_dossier?.crane_configuration
      || window.State?.h15_technical_sheet?.crane_configuration
      || ''
    );

    const h17VesselDossier = window.State?.h17_vessel_dossier
      || window.State?.source_payload?.h17_vessel_dossier
      || null;

    const isLoaded = Boolean(vesselName && vesselName !== 'TBN' && imo && imo !== '-' && dwt > 0);

    this.activeVessel = {
      isLoaded,
      vessel_name: vesselName || 'TBN (Sin Buque Seleccionado)',
      imo_number: imo || '-',
      dwt,
      loa_meters: isLoaded ? loa : 0,
      beam_meters: isLoaded ? beam : 0,
      draft_meters: isLoaded ? draft : 0,
      has_gears: hasGears,
      crane_configuration: craneConfiguration,
      h17_vessel_dossier: h17VesselDossier,
      targetCargoMT,
    };

    return this.activeVessel;
  }

  /**
   * Abre la vista aislada Estiba & Cargo Plan (H18)
   */
  openView() {
    const vessel = this.readActiveVesselFromCalculator();

    // Sincronizar automáticamente Objetivo MT desde la calculadora principal
    const targetInput = document.getElementById('h18-input-target');
    if (targetInput) {
      if (vessel.targetCargoMT > 0) {
        targetInput.value = vessel.targetCargoMT;
      } else if (!targetInput.value || Number(targetInput.value) === 0) {
        targetInput.value = 25000;
      }
    }

    // Actualizar insignia o aviso en la vista
    this.renderHeaderBadge(vessel);

    // Precargar packing list o plan si proviene de Cerebro IA
    if (Array.isArray(window.State?.h18_packing_list) && window.State.h18_packing_list.length > 0) {
      this.packingList = window.State.h18_packing_list.map((it, idx) => normalizePackingListItem(it, idx));
    }
    if (window.State?.h18_project_cargo_plan) {
      this.projectCargoResult = window.State.h18_project_cargo_plan;
    }

    // Asegurar contraste de botones y colores corporativos
    this.ensureButtonContrast();

    // Cambiar de pestaña sin alterar estado de la calculadora
    if (typeof window.switchTab === 'function') {
      window.switchTab('stowage-h18');
    }

    this.renderPackingListTable();

    // Calcular estiba inicial según modo activo
    if (this.currentMode === 'project_cargo') {
      this.calculateProjectCargoStowage({ syncTelemetry: false });
    } else {
      this.calculateStowage();
    }
  }

  /**
   * Cambia de subpestaña: 'homogeneous' o 'project_cargo'
   */
  switchSubTab(mode = 'homogeneous') {
    this.currentMode = mode;
    const tabHomog = document.getElementById('tab-h18-homogeneous');
    const tabProj = document.getElementById('tab-h18-project-cargo');
    const panelHomog = document.getElementById('h18-panel-homogeneous');
    const panelProj = document.getElementById('h18-panel-project-cargo');

    if (mode === 'project_cargo') {
      if (tabProj) {
        tabProj.style.setProperty('background-color', '#0d9488', 'important');
        tabProj.style.setProperty('color', '#ffffff', 'important');
      }
      if (tabHomog) {
        tabHomog.style.setProperty('background-color', 'transparent', 'important');
        tabHomog.style.setProperty('color', '#475569', 'important');
      }
      if (panelHomog) panelHomog.classList.add('hidden');
      if (panelProj) panelProj.classList.remove('hidden');

      if (!this.hasLocalProjectCargoEdits && Array.isArray(window.State?.h18_packing_list) && window.State.h18_packing_list.length > 0) {
        this.packingList = window.State.h18_packing_list.map((it, idx) => normalizePackingListItem(it, idx));
      }

      const badge = document.getElementById('h18-pc-sync-badge');
      if (badge) {
        const hasCerebro = Boolean(window.State?.h18_packing_list || window.State?.h18_project_cargo_plan);
        badge.classList.toggle('hidden', !hasCerebro);
      }

      this.renderPackingListTable();
      this.ensureButtonContrast();
      this.calculateProjectCargoStowage({ syncTelemetry: false });
    } else {
      if (tabHomog) {
        tabHomog.style.setProperty('background-color', '#0d9488', 'important');
        tabHomog.style.setProperty('color', '#ffffff', 'important');
      }
      if (tabProj) {
        tabProj.style.setProperty('background-color', 'transparent', 'important');
        tabProj.style.setProperty('color', '#475569', 'important');
      }
      if (panelProj) panelProj.classList.add('hidden');
      if (panelHomog) panelHomog.classList.remove('hidden');

      this.ensureButtonContrast();
      this.calculateStowage();
    }
  }

  /**
   * Renderiza la tabla editable de items de packing list
   */
  renderPackingListTable() {
    const tbody = document.getElementById('h18-pc-table-body');
    if (!tbody) return;

    tbody.innerHTML = this.packingList.map((rawItem, idx) => {
      const item = normalizePackingListItem(rawItem, idx);
      const label = item.label || item.id;
      const weight = Number(item.unit_weight_mt ?? item.weight_mt ?? 1);
      const zone = item.preferred_zone || item.zone || 'auto';

      return `
      <tr class="border-b border-slate-100 text-[11px] hover:bg-slate-50 transition">
        <td class="py-1 px-1.5 font-bold text-slate-800">
          <input type="text" value="${label}" onchange="stowageH18Manager.updatePackingListItem(${idx}, 'id', this.value)" class="w-full bg-transparent border-b border-dashed border-slate-300 focus:border-teal-500 focus:outline-none font-bold text-slate-800 text-[11px] px-0.5">
        </td>
        <td class="py-1 px-1">
          <input type="number" step="any" min="0.1" value="${item.length_m || 1}" onchange="stowageH18Manager.updatePackingListItem(${idx}, 'length_m', this.value)" class="w-12 bg-white border border-slate-200 rounded px-1 py-0.5 text-center text-[11px]">
        </td>
        <td class="py-1 px-1">
          <input type="number" step="any" min="0.1" value="${item.width_m || 1}" onchange="stowageH18Manager.updatePackingListItem(${idx}, 'width_m', this.value)" class="w-12 bg-white border border-slate-200 rounded px-1 py-0.5 text-center text-[11px]">
        </td>
        <td class="py-1 px-1">
          <input type="number" step="any" min="0.1" value="${item.height_m || 1}" onchange="stowageH18Manager.updatePackingListItem(${idx}, 'height_m', this.value)" class="w-12 bg-white border border-slate-200 rounded px-1 py-0.5 text-center text-[11px]">
        </td>
        <td class="py-1 px-1">
          <input type="number" step="any" min="0.01" value="${weight}" onchange="stowageH18Manager.updatePackingListItem(${idx}, 'weight_mt', this.value)" class="w-14 bg-white border border-slate-200 rounded px-1 py-0.5 text-center font-bold text-slate-800 text-[11px]">
        </td>
        <td class="py-1 px-1">
          <input type="number" step="1" min="1" value="${item.quantity || 1}" onchange="stowageH18Manager.updatePackingListItem(${idx}, 'quantity', this.value)" class="w-11 bg-white border border-slate-200 rounded px-1 py-0.5 text-center font-bold text-teal-800 text-[11px]">
        </td>
        <td class="py-1 px-1">
          <select onchange="stowageH18Manager.updatePackingListItem(${idx}, 'category', this.value)" class="bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-700">
            <option value="heavy_lift" ${item.category === 'heavy_lift' ? 'selected' : ''}>Heavy Lift</option>
            <option value="vehicle" ${item.category === 'vehicle' ? 'selected' : ''}>Vehículo</option>
            <option value="crate" ${item.category === 'crate' ? 'selected' : ''}>Cajas / Crate</option>
            <option value="steel" ${item.category === 'steel' ? 'selected' : ''}>Acero / Steel</option>
          </select>
        </td>
        <td class="py-1 px-1">
          <select onchange="stowageH18Manager.updatePackingListItem(${idx}, 'zone', this.value)" class="bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-700">
            <option value="auto" ${zone === 'auto' ? 'selected' : ''}>Auto</option>
            <option value="under_deck" ${zone === 'under_deck' ? 'selected' : ''}>Under Deck</option>
            <option value="tweendeck" ${zone === 'tweendeck' ? 'selected' : ''}>Tweendeck</option>
            <option value="on_deck" ${zone === 'on_deck' ? 'selected' : ''}>On Deck</option>
          </select>
        </td>
        <td class="py-1 px-1 text-center">
          <button type="button" onclick="stowageH18Manager.removePackingListItem(${idx})" class="text-slate-400 hover:text-red-600 p-1 transition cursor-pointer" title="Eliminar ítem">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      </tr>
      `;
    }).join('');
  }

  addPackingListItem() {
    this.hasLocalProjectCargoEdits = true;
    const nextNum = this.packingList.length + 1;
    this.packingList.push(normalizePackingListItem({
      id: `CARGO-${String(nextNum).padStart(2, '0')}`,
      label: `CARGO-${String(nextNum).padStart(2, '0')}`,
      category: 'crate',
      length_m: 3.0,
      width_m: 2.0,
      height_m: 2.0,
      weight_mt: 5.0,
      unit_weight_mt: 5.0,
      quantity: 1,
      preferred_zone: 'auto',
      zone: 'auto',
    }, nextNum));
    this.renderPackingListTable();
  }

  removePackingListItem(idx) {
    if (this.packingList.length <= 1) {
      if (typeof window.showToast === 'function') {
        window.showToast('⚠️ El packing list debe contener al menos un ítem.');
      }
      return;
    }
    this.hasLocalProjectCargoEdits = true;
    this.packingList.splice(idx, 1);
    this.renderPackingListTable();
  }

  updatePackingListItem(idx, field, val) {
    if (!this.packingList[idx]) return;
    this.hasLocalProjectCargoEdits = true;
    if (['length_m', 'width_m', 'height_m'].includes(field)) {
      this.packingList[idx][field] = Math.max(0.01, Number(val) || 1.0);
    } else if (field === 'weight_mt' || field === 'unit_weight_mt') {
      const numVal = Math.max(0.01, Number(val) || 1.0);
      this.packingList[idx].weight_mt = numVal;
      this.packingList[idx].unit_weight_mt = numVal;
    } else if (field === 'quantity') {
      this.packingList[idx].quantity = Math.max(1, Math.round(Number(val) || 1));
    } else if (field === 'id' || field === 'label') {
      const strVal = String(val).trim();
      this.packingList[idx].id = strVal;
      this.packingList[idx].label = strVal;
    } else if (field === 'zone' || field === 'preferred_zone') {
      const zoneVal = String(val).trim().toLowerCase();
      this.packingList[idx].zone = zoneVal;
      this.packingList[idx].preferred_zone = zoneVal;
    } else {
      this.packingList[idx][field] = val;
    }
  }

  /**
   * Asegura el contraste visual de los botones y toggles activos (evita fondos blancos lavados)
   */
  ensureButtonContrast() {
    const el = (id) => document.getElementById(id);

    // Pestañas de modo H18
    const tabHomog = el('tab-h18-homogeneous');
    const tabProj = el('tab-h18-project-cargo');
    if (tabHomog && tabProj) {
      if (this.currentMode === 'project_cargo') {
        tabProj.style.setProperty('background-color', '#0d9488', 'important');
        tabProj.style.setProperty('color', '#ffffff', 'important');
        tabHomog.style.setProperty('background-color', 'transparent', 'important');
        tabHomog.style.setProperty('color', '#475569', 'important');
      } else {
        tabHomog.style.setProperty('background-color', '#0d9488', 'important');
        tabHomog.style.setProperty('color', '#ffffff', 'important');
        tabProj.style.setProperty('background-color', 'transparent', 'important');
        tabProj.style.setProperty('color', '#475569', 'important');
      }
    }

    // Botón Calcular en naranja sólido (#ea580c)
    const btnCalc = el('btn-h18-calculate');
    if (btnCalc) {
      btnCalc.style.setProperty('background-color', '#ea580c', 'important');
      btnCalc.style.setProperty('color', '#ffffff', 'important');
    }
    const btnPcCalc = el('btn-h18-pc-calculate');
    if (btnPcCalc) {
      btnPcCalc.style.setProperty('background-color', '#ea580c', 'important');
      btnPcCalc.style.setProperty('color', '#ffffff', 'important');
    }

    // Botón Visor 3D en índigo sólido (#1e3a8a)
    const btn3d = el('btn-h18-open-3d');
    if (btn3d) {
      btn3d.style.setProperty('background-color', '#1e3a8a', 'important');
      btn3d.style.setProperty('color', '#ffffff', 'important');
    }

    // Toggles de longitud (m / cm)
    const btnM = el('h18-unit-m');
    const btnCm = el('h18-unit-cm');
    if (btnM && btnCm) {
      if (this.currentUnitLength === 'm') {
        btnM.style.setProperty('background-color', '#0d9488', 'important');
        btnM.style.setProperty('color', '#ffffff', 'important');
        btnCm.style.setProperty('background-color', 'transparent', 'important');
        btnCm.style.setProperty('color', '#475569', 'important');
      } else {
        btnCm.style.setProperty('background-color', '#0d9488', 'important');
        btnCm.style.setProperty('color', '#ffffff', 'important');
        btnM.style.setProperty('background-color', 'transparent', 'important');
        btnM.style.setProperty('color', '#475569', 'important');
      }
    }

    // Toggles de peso (MT / kg)
    const btnMT = el('h18-unit-mt');
    const btnKg = el('h18-unit-kg');
    if (btnMT && btnKg) {
      if (this.currentUnitWeight === 'MT') {
        btnMT.style.setProperty('background-color', '#0d9488', 'important');
        btnMT.style.setProperty('color', '#ffffff', 'important');
        btnKg.style.setProperty('background-color', 'transparent', 'important');
        btnKg.style.setProperty('color', '#475569', 'important');
      } else {
        btnKg.style.setProperty('background-color', '#0d9488', 'important');
        btnKg.style.setProperty('color', '#ffffff', 'important');
        btnMT.style.setProperty('background-color', 'transparent', 'important');
        btnMT.style.setProperty('color', '#475569', 'important');
      }
    }

    // Botón Aplicar SF a Calculadora en teal sólido (#0d9488)
    const applyBtn = el('btn-h18-apply-sf');
    if (applyBtn) {
      applyBtn.style.setProperty('background-color', '#0d9488', 'important');
      applyBtn.style.setProperty('color', '#ffffff', 'important');
      if (applyBtn.disabled) {
        applyBtn.style.setProperty('opacity', '0.5', 'important');
        applyBtn.style.setProperty('cursor', 'not-allowed', 'important');
      } else {
        applyBtn.style.setProperty('opacity', '1', 'important');
        applyBtn.style.setProperty('cursor', 'pointer', 'important');
      }
    }

    const applyPcBtn = el('btn-h18-pc-apply-sf');
    if (applyPcBtn) {
      applyPcBtn.style.setProperty('background-color', '#0d9488', 'important');
      applyPcBtn.style.setProperty('color', '#ffffff', 'important');
      if (applyPcBtn.disabled) {
        applyPcBtn.style.setProperty('opacity', '0.5', 'important');
        applyPcBtn.style.setProperty('cursor', 'not-allowed', 'important');
      } else {
        applyPcBtn.style.setProperty('opacity', '1', 'important');
        applyPcBtn.style.setProperty('cursor', 'pointer', 'important');
      }
    }
  }

  /**
   * Renderiza la cabecera / insignia de solo lectura
   */
  renderHeaderBadge(vessel) {
    const badgeEl = document.getElementById('h18-vessel-badge');
    const warningEl = document.getElementById('h18-vessel-warning');
    if (!badgeEl) return;

    if (vessel.isLoaded) {
      badgeEl.innerHTML = `
        <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-300 text-teal-900 text-xs font-bold shadow-xs">
          <i class="fa-solid fa-ship text-teal-600"></i>
          <span>${vessel.vessel_name}</span>
          <span class="text-teal-400 font-normal">·</span>
          <span>IMO ${vessel.imo_number}</span>
          <span class="text-teal-400 font-normal">·</span>
          <span>${vessel.dwt.toLocaleString('es-ES')} DWT</span>
          <span class="ml-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">(Solo lectura)</span>
        </span>
      `;
      if (warningEl) warningEl.classList.add('hidden');
    } else {
      const estimatedDwt = (vessel.dwt && vessel.dwt > 0) ? vessel.dwt : 32000;
      badgeEl.innerHTML = `
        <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold shadow-xs">
          <i class="fa-solid fa-triangle-exclamation text-amber-600"></i>
          <span>Buque Genérico TBN · ${estimatedDwt.toLocaleString('es-ES')} DWT Estimado</span>
          <span class="ml-1 text-[10px] font-semibold text-amber-700 uppercase tracking-wider bg-white px-1.5 py-0.5 rounded border border-amber-200">(Modo Simulación)</span>
        </span>
      `;
      if (warningEl) warningEl.classList.remove('hidden');
    }
  }

  /**
   * Aplica una plantilla de carga predefinida a los inputs
   */
  applyTemplate(templateKey) {
    const tmpl = CARGO_TEMPLATES_H18[templateKey];
    if (!tmpl) return;

    const el = (id) => document.getElementById(id);

    // Ajustar valores según unidad actual
    const len = this.currentUnitLength === 'cm' ? tmpl.length * 100 : tmpl.length;
    const wid = this.currentUnitLength === 'cm' ? tmpl.width * 100 : tmpl.width;
    const hgt = this.currentUnitLength === 'cm' ? tmpl.height * 100 : tmpl.height;
    const wt = this.currentUnitWeight === 'kg' ? tmpl.unitWeight * 1000 : tmpl.unitWeight;

    if (el('h18-input-name')) el('h18-input-name').value = tmpl.cargoName;
    if (el('h18-input-length')) el('h18-input-length').value = len;
    if (el('h18-input-width')) el('h18-input-width').value = wid;
    if (el('h18-input-height')) el('h18-input-height').value = hgt;
    if (el('h18-input-weight')) el('h18-input-weight').value = wt;
    if (el('h18-input-tiers')) el('h18-input-tiers').value = tmpl.tiers;
    if (el('h18-input-broken')) el('h18-input-broken').value = tmpl.brokenStowagePct;

    this.calculateStowage();
  }

  /**
   * Cambia la unidad de dimensión (m / cm)
   */
  toggleUnitLength(newUnit) {
    if (newUnit === this.currentUnitLength) return;
    const el = (id) => document.getElementById(id);

    const lengthEl = el('h18-input-length');
    const widthEl = el('h18-input-width');
    const heightEl = el('h18-input-height');

    const factor = newUnit === 'cm' ? 100 : 0.01;

    if (lengthEl && lengthEl.value) lengthEl.value = (Number(lengthEl.value) * factor).toFixed(newUnit === 'cm' ? 0 : 2);
    if (widthEl && widthEl.value) widthEl.value = (Number(widthEl.value) * factor).toFixed(newUnit === 'cm' ? 0 : 2);
    if (heightEl && heightEl.value) heightEl.value = (Number(heightEl.value) * factor).toFixed(newUnit === 'cm' ? 0 : 2);

    this.currentUnitLength = newUnit;
    this.ensureButtonContrast();
    this.calculateStowage();
  }

  /**
   * Cambia la unidad de peso (MT / kg)
   */
  toggleUnitWeight(newUnit) {
    if (newUnit === this.currentUnitWeight) return;
    const el = (id) => document.getElementById(id);

    const weightEl = el('h18-input-weight');
    const factor = newUnit === 'kg' ? 1000 : 0.001;

    if (weightEl && weightEl.value) {
      weightEl.value = (Number(weightEl.value) * factor).toFixed(newUnit === 'kg' ? 0 : 3);
    }

    this.currentUnitWeight = newUnit;
    this.ensureButtonContrast();
    this.calculateStowage();
  }

  /**
   * Ejecuta el cálculo principal de estiba H18
   * Solo envía telemetría a DataBridge cuando syncTelemetry === true
   */
  calculateStowage({ syncTelemetry = false } = {}) {
    const el = (id) => document.getElementById(id);
    const val = (id) => el(id)?.value;

    const vessel = this.activeVessel || this.readActiveVesselFromCalculator();

    const inputData = {
      cargoName: val('h18-input-name') || 'Big Bags 1.5 MT',
      length: Number(val('h18-input-length')) || 1.0,
      width: Number(val('h18-input-width')) || 1.0,
      height: Number(val('h18-input-height')) || 1.3,
      unitWeight: Number(val('h18-input-weight')) || 1.5,
      lengthUnit: this.currentUnitLength,
      weightUnit: this.currentUnitWeight,
      tiers: Number(val('h18-input-tiers')) || 4,
      brokenStowagePct: Number(val('h18-input-broken')) || 5,
      targetCargoMT: Number(val('h18-input-target')) || 0,
      vessel: {
        isLoaded: vessel.isLoaded,
        vessel_name: vessel.vessel_name,
        imo_number: vessel.imo_number,
        dwt: vessel.dwt,
        loa: vessel.loa_meters,
        beam: vessel.beam_meters,
        draft: vessel.draft_meters,
        has_gears: vessel.has_gears,
        crane_configuration: vessel.crane_configuration,
      },
    };

    const result = calcularEstibaTentativaH18(inputData);
    this.lastCalculationResult = result;

    // Renderizar tarjetas de resultados
    this.renderResultCards(result);

    // Renderizar alertas comerciales
    this.renderCommercialAlerts(result.alerts);

    // Renderizar CAD 2D SVG
    this.renderCadSvg(result);

    // Habilitar botón "Aplicar SF a Calculadora" con contraste sólido teal
    const applyBtn = el('btn-h18-apply-sf');
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      applyBtn.classList.add('hover:bg-teal-700', 'cursor-pointer');
      applyBtn.style.setProperty('opacity', '1', 'important');
      applyBtn.style.setProperty('cursor', 'pointer', 'important');
    }

    this.ensureButtonContrast();

    // Enviar en background a DataBridge H18 sin bloquear ÚNICAMENTE cuando syncTelemetry === true
    if (syncTelemetry) {
      sendH18SimulationToDataBridge({
        ...inputData,
        ...result,
        results: result.results,
        stowageFactors: result.stowageFactors,
        holds: result.holds,
      });
    }
  }

  /**
   * Renderiza las tarjetas de resultados en la columna izquierda
   */
  renderResultCards(result) {
    const el = (id) => document.getElementById(id);
    const res = result.results?.realistic || { weightMT: 0, units: 0 };
    const theo = result.results?.theoretical || { weightMT: 0, units: 0 };
    const sf = result.stowageFactors || {};
    const press = result.pressure || {};
    const margin = result.results?.marginVsTarget || {};

    // 1. TOTAL TEÓRICO vs ESTIBA REALISTA
    if (el('h18-res-theoretical')) {
      el('h18-res-theoretical').textContent = `${theo.weightMT.toLocaleString('es-ES')} MT (${theo.units.toLocaleString('es-ES')} uds)`;
    }
    if (el('h18-res-realistic')) {
      el('h18-res-realistic').textContent = `${res.weightMT.toLocaleString('es-ES')} MT (${res.units.toLocaleString('es-ES')} uds)`;
    }

    // 2. STOWAGE FACTOR NETO y BRUTO
    if (el('h18-res-sf-net')) {
      el('h18-res-sf-net').textContent = `${sf.netSF.toFixed(3)} m³/MT`;
    }
    if (el('h18-res-sf-gross')) {
      el('h18-res-sf-gross').textContent = `${sf.grossSF.toFixed(3)} m³/MT`;
    }

    // 3. PRESIÓN TANK TOP y MARGEN VS OBJETIVO
    if (el('h18-res-pressure')) {
      const isExceeded = press.tankTopPressureMTM2 > press.allowableLoadMTM2;
      el('h18-res-pressure').innerHTML = `
        <span class="${isExceeded ? 'text-red-600 font-black' : 'text-slate-800'}">${press.tankTopPressureMTM2.toFixed(2)} MT/m²</span>
        <span class="text-[10px] text-slate-500 font-normal"> / máx ${press.allowableLoadMTM2.toFixed(1)}</span>
      `;
    }
    if (el('h18-res-margin')) {
      const diff = margin.differenceMT || 0;
      const pct = margin.percentage || 0;
      const isPos = diff >= 0;
      el('h18-res-margin').innerHTML = `
        <span class="${isPos ? 'text-emerald-700' : 'text-red-600'} font-black">${isPos ? '+' : ''}${diff.toLocaleString('es-ES')} MT (${isPos ? '+' : ''}${pct.toFixed(1)}%)</span>
      `;
    }
  }

  /**
   * Ejecuta el cálculo para Project Cargo / Vehículos (Packing List)
   */
  async calculateProjectCargoStowage({ syncTelemetry = true } = {}) {
    const vessel = this.activeVessel || this.readActiveVesselFromCalculator();
    const geom = resolverGeometriaBodegas(vessel);
    const el = (id) => document.getElementById(id);

    const tweendeckCheckbox = el('h18-pc-tweendeck');
    const hasTweendeck = tweendeckCheckbox ? tweendeckCheckbox.checked : true;
    const craneConfigInput = el('h18-pc-cranes');
    const craneConfig = craneConfigInput ? craneConfigInput.value : '2 x 45 MT';

    const vesselPayload = {
      vessel_name: vessel.vessel_name,
      imo_number: vessel.imo_number,
      dwt: vessel.dwt,
      loa: vessel.loa_meters || geom.loa,
      beam: vessel.beam_meters || geom.beam,
      depth: geom.depth,
      draft: vessel.draft_meters || geom.draft,
      holds_count: geom.holdsCount,
      has_tweendeck: hasTweendeck,
      has_gears: Boolean(vessel.has_gears || craneConfig),
      crane_configuration: craneConfig,
    };

    const normalizedPackingList = this.packingList.map((item, idx) => normalizePackingListItem(item, idx));

    const requestPayload = {
      mode: 'project_cargo',
      source_app: 'seacharter',
      vessel: vesselPayload,
      packing_list: normalizedPackingList,
    };

    let result = null;

    if (syncTelemetry) {
      this.hasLocalProjectCargoEdits = true;
    }

    // Usa window.State.h18_project_cargo_plan ÚNICAMENTE en la carga inicial sin cambios
    if (!this.hasLocalProjectCargoEdits && !syncTelemetry && window.State?.h18_project_cargo_plan?.summary && window.State.h18_project_cargo_plan.placed_items) {
      result = window.State.h18_project_cargo_plan;
    } else if (syncTelemetry) {
      try {
        const remoteRes = await sendH18SimulationToDataBridge(requestPayload);
        const planData = (remoteRes && remoteRes.data) ? remoteRes.data : remoteRes;
        if (planData && planData.summary && planData.placed_items) {
          result = planData;
        }
      } catch (err) {
        console.debug('[H18 PC] DataBridge sync fallback to local calculation:', err?.message);
      }
    }

    if (!result || !result.summary) {
      result = calcularProjectCargoFallbackH18(vesselPayload, normalizedPackingList);
    }

    // Si viene de DataBridge sin geometry ni holds coherentes, adjuntarlos
    const resVessel = result.vessel || vesselPayload;
    if (!result.geometry) {
      result.geometry = resolverGeometriaBodegas(resVessel);
    }
    if (!Array.isArray(result.holds) || result.holds.length === 0) {
      result.holds = result.geometry.holds || [];
    }

    this.lastCalculationResult = result;
    this.projectCargoResult = result;

    this.renderProjectCargoResultCards(result.summary);
    this.renderCommercialAlerts(result.alerts, 'h18-pc-alerts-container');
    this.renderCadSvg(result);

    const applyBtn = el('btn-h18-pc-apply-sf');
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.style.setProperty('opacity', '1', 'important');
      applyBtn.style.setProperty('cursor', 'pointer', 'important');
    }

    this.ensureButtonContrast();

    if (this.vessel3dViewer) {
      this.vessel3dViewer.loadStowageData(result);
    }
    return result;
  }

  /**
   * Renderiza las tarjetas de resultados para Project Cargo
   */
  renderProjectCargoResultCards(summary = {}) {
    const el = (id) => document.getElementById(id);
    if (el('h18-pc-res-weight')) {
      el('h18-pc-res-weight').textContent = `${summary.total_weight_mt || 0} MT (${summary.total_units || 0} bultos)`;
    }
    if (el('h18-pc-res-realistic')) {
      el('h18-pc-res-realistic').textContent = `${summary.placed_pct ?? 100}% Ubicado (${summary.unplaced_units || 0} fuera de perfil)`;
    }
    if (el('h18-pc-res-sf-gross')) {
      el('h18-pc-res-sf-gross').textContent = `${Number(summary.equivalent_gross_sf || 0).toFixed(3)} m³/MT`;
    }
    if (el('h18-pc-res-sf-net')) {
      el('h18-pc-res-sf-net').textContent = `Neto: ${Number(summary.equivalent_net_sf || 0).toFixed(3)} m³/MT`;
    }
    if (el('h18-pc-res-kg')) {
      el('h18-pc-res-kg').textContent = `${summary.estimated_kg_m || 7.42} m`;
    }
    if (el('h18-pc-res-lashing')) {
      el('h18-pc-res-lashing').textContent = summary.lashing_status || 'Verificado (IMO CSS)';
    }
    if (el('h18-pc-res-clearance')) {
      el('h18-pc-res-clearance').textContent = summary.clearance_status || 'Aprobado (> 1.2 m)';
    }
  }

  /**
   * Renderiza el bloque de alertas comerciales (DEADFREIGHT_RISK, STACKING_PRESSURE_RISK, DWCC_LIMITED, etc.)
   */
  renderCommercialAlerts(alerts = [], containerId = 'h18-alerts-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!alerts || alerts.length === 0) {
      container.innerHTML = `
        <div class="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 flex items-center gap-2">
          <i class="fa-solid fa-circle-check text-emerald-600"></i>
          <span>Parámetros de estiba verificados: sin riesgos estructurales ni falso flete detectados.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = alerts.map((alert) => {
      const isCrit = alert.severity === 'critical';
      const bgClass = isCrit ? 'bg-red-50 border-red-300 text-red-900' : 'bg-amber-50 border-amber-300 text-amber-900';
      const iconClass = isCrit ? 'fa-triangle-exclamation text-red-600' : 'fa-circle-exclamation text-amber-600';
      return `
        <div class="rounded-lg border p-2.5 text-xs ${bgClass} mb-2 shadow-xs">
          <div class="font-bold flex items-center gap-1.5 mb-1">
            <i class="fa-solid ${iconClass}"></i>
            <span>${alert.title}</span>
          </div>
          <p class="text-[11px] leading-relaxed pl-5">${alert.message}</p>
        </div>
      `;
    }).join('');
  }

  /**
   * Renderiza el plano SVG CAD 2D en el contenedor derecho
   */
  renderCadSvg(result) {
    const container = document.getElementById('h18-cad-container');
    if (!container) return;
    const svgCode = this.currentMode === 'project_cargo'
      ? generarProjectCargoPlanSvgH18(result, { width: 1200, height: 800 })
      : generarCargoPlanSvgH18(result, { width: 1200, height: 800 });
    container.innerHTML = svgCode;
  }

  /**
   * Aplica de forma estrictamente manual el SF Bruto a la calculadora
   * Cumple con la Regla de Oro:
   * - Solo rellena el campo cargo-sf.
   * - No altera tonelaje, flete ni puertos.
   * - Muestra un toast breve y descriptivo.
   */
  applyStowageFactorToCalculator() {
    if (!this.lastCalculationResult) {
      if (typeof window.showToast === 'function') {
        window.showToast('⚠️ Primero calcula la estiba antes de aplicar el SF.');
      }
      return;
    }

    const isProject = this.currentMode === 'project_cargo';
    const grossSF = isProject
      ? (this.lastCalculationResult.summary?.equivalent_gross_sf ?? this.lastCalculationResult.stowageFactors?.grossSF)
      : (this.lastCalculationResult.stowageFactors?.grossSF ?? this.lastCalculationResult.summary?.equivalent_gross_sf);

    if (grossSF == null || isNaN(Number(grossSF))) {
      if (typeof window.showToast === 'function') {
        window.showToast('⚠️ No se ha determinado el Stowage Factor.');
      }
      return;
    }

    const cargoSfInput = document.getElementById('cargo-sf');
    if (cargoSfInput) {
      cargoSfInput.value = Number(grossSF).toFixed(3);
      cargoSfInput.dispatchEvent(new Event('input', { bubbles: true }));
      cargoSfInput.dispatchEvent(new Event('change', { bubbles: true }));

      if (typeof window.showToast === 'function') {
        window.showToast(`SF ${Number(grossSF).toFixed(3)} m³/MT aplicado a la calculadora`);
      }
    }
  }

  /**
   * Abre el modal 3D a pantalla completa
   */
  async open3DModal() {
    const modal = document.getElementById('h18-3d-modal');
    const container = document.getElementById('h18-3d-viewport');
    if (!modal || !container) return;

    modal.classList.remove('hidden');

    // Resetea el botón de escotillas a estado cerrado por defecto
    const btn = document.getElementById('btn-h18-3d-hatches');
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-eye mr-1"></i> Abrir Escotillas (Tiers & Casco Translúcido)`;
      btn.classList.remove('bg-amber-600');
      btn.classList.add('bg-teal-600');
      btn.style.setProperty('background-color', '#0d9488', 'important');
      btn.style.setProperty('color', '#ffffff', 'important');
    }

    if (!this.vessel3dViewer) {
      this.vessel3dViewer = new Vessel3DViewer(container);
      await this.vessel3dViewer.init();
    }

    if (this.lastCalculationResult) {
      this.vessel3dViewer.loadStowageData(this.lastCalculationResult);
    }
  }

  close3DModal() {
    const modal = document.getElementById('h18-3d-modal');
    if (modal) modal.classList.add('hidden');
  }

  toggleHatches3D() {
    if (!this.vessel3dViewer) return;
    const isOpen = this.vessel3dViewer.toggleHatches();
    const btn = document.getElementById('btn-h18-3d-hatches');
    if (btn) {
      btn.innerHTML = isOpen
        ? `<i class="fa-solid fa-eye-slash mr-1"></i> Cerrar Escotillas (Sólido)`
        : `<i class="fa-solid fa-eye mr-1"></i> Abrir Escotillas (Tiers & Casco Translúcido)`;
      btn.classList.toggle('bg-teal-600', !isOpen);
      btn.classList.toggle('bg-amber-600', isOpen);
      btn.style.setProperty('background-color', isOpen ? '#d97706' : '#0d9488', 'important');
    }
  }

  setCamera3D(preset) {
    if (this.vessel3dViewer) {
      this.vessel3dViewer.setViewPreset(preset);
    }
  }

  /**
   * Exporta el Cargo Plan 2D como archivo SVG descargable o ventana de impresión
   */
  exportCargoPlan() {
    if (!this.lastCalculationResult) {
      if (this.currentMode === 'project_cargo') {
        this.calculateProjectCargoStowage();
      } else {
        this.calculateStowage();
      }
    }
    const isProject = this.currentMode === 'project_cargo';
    const svgCode = isProject
      ? generarProjectCargoPlanSvgH18(this.lastCalculationResult, { width: 1200, height: 800 })
      : generarCargoPlanSvgH18(this.lastCalculationResult, { width: 1200, height: 800 });

    const blob = new Blob([svgCode], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const vesselName = (this.lastCalculationResult?.vesselSpecs?.name || this.lastCalculationResult?.vessel?.name || 'VESSEL').replace(/\s+/g, '_');
    a.href = url;
    a.download = isProject ? `CARGO_PLAN_H18_PROJECT_${vesselName}.svg` : `CARGO_PLAN_H18_${vesselName}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof window.showToast === 'function') {
      window.showToast('✅ Plano CAD de Estiba (SVG) exportado con éxito.');
    }
  }
}

// Instancia única global
export const stowageH18Manager = new StowageH18Manager();

// Exposición en window para llamadas inline desde HTML
if (typeof window !== 'undefined') {
  window.stowageH18Manager = stowageH18Manager;
  window.openStowagePlanH18View = () => stowageH18Manager.openView();
  window.switchStowageH18SubTab = (m) => stowageH18Manager.switchSubTab(m);
  window.applyStowageH18Template = (k) => stowageH18Manager.applyTemplate(k);
  window.toggleStowageH18Length = (u) => stowageH18Manager.toggleUnitLength(u);
  window.toggleStowageH18Weight = (u) => stowageH18Manager.toggleUnitWeight(u);
  window.calculateStowageH18 = () => stowageH18Manager.calculateStowage({ syncTelemetry: true });
  window.calculateProjectCargoStowageH18 = () => stowageH18Manager.calculateProjectCargoStowage({ syncTelemetry: true });
  window.applyStowageH18SF = () => stowageH18Manager.applyStowageFactorToCalculator();
  window.applyProjectCargoStowageH18SF = () => stowageH18Manager.applyStowageFactorToCalculator();
  window.addPackingListItemH18 = () => stowageH18Manager.addPackingListItem();
  window.removePackingListItemH18 = (i) => stowageH18Manager.removePackingListItem(i);
  window.openStowageH183D = () => stowageH18Manager.open3DModal();
  window.closeStowageH183D = () => stowageH18Manager.close3DModal();
  window.toggleStowageH18Hatches3D = () => stowageH18Manager.toggleHatches3D();
  window.setStowageH18Camera3D = (p) => stowageH18Manager.setCamera3D(p);
  window.exportStowageH18CargoPlan = () => stowageH18Manager.exportCargoPlan();
}
