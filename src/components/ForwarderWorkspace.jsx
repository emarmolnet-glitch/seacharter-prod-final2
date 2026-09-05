import React, { useState, useEffect, useRef } from 'react';
import { parsePackingListFile } from '../utils/packingListParser.js';

/**
 * Componente contador numérico con botones [+] y [-] para materiales y personal.
 */
function NumericCounter({ label, subtitle, value, onChange, min = 0 }) {
  const numValue = Number(value) || 0;

  const handleDecrement = () => {
    if (numValue > min) {
      onChange(numValue - 1);
    }
  };

  const handleIncrement = () => {
    onChange(numValue + 1);
  };

  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between hover:border-slate-700 transition shadow-sm">
      <div className="mb-2">
        <span className="block text-xs font-bold text-slate-200 tracking-wide">{label}</span>
        {subtitle && <span className="block text-[11px] text-slate-400 mt-0.5">{subtitle}</span>}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Unidades</span>
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg p-1">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={numValue <= min}
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 disabled:opacity-30 disabled:hover:bg-slate-800 text-base font-black transition cursor-pointer"
            aria-label={`Disminuir ${label}`}
          >
            -
          </button>
          <input
            type="number"
            min={min}
            value={numValue}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              onChange(isNaN(parsed) ? 0 : Math.max(min, parsed));
            }}
            className="w-14 text-center bg-transparent text-sm font-mono font-bold text-sky-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={handleIncrement}
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-base font-black transition cursor-pointer"
            aria-label={`Aumentar ${label}`}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ForwarderWorkspace - Módulo B2B para Transitarios (Forwarders).
 */
export function ForwarderWorkspace() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [activeProject, setActiveProject] = useState(null);

  const [isCargoModalOpen, setIsCargoModalOpen] = useState(false);
  const [editingLineItemId, setEditingLineItemId] = useState(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null);

  const [showExecutiveReport, setShowExecutiveReport] = useState(false);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const fileInputRef = useRef(null);

  const [cargoItems, setCargoItems] = useState([]);

  const [dunnageWood, setDunnageWood] = useState(0);
  const [highCapacitySlings, setHighCapacitySlings] = useState(0);
  const [chainsBinders, setChainsBinders] = useState(0);
  const [shackles, setShackles] = useState(0);

  const [stevedoreGangs, setStevedoreGangs] = useState(0);
  const [lashingTeam, setLashingTeam] = useState(0);
  const [heavyLiftCrane, setHeavyLiftCrane] = useState(0);
  const [mafiPlatforms, setMafiPlatforms] = useState(0);

  const [shippingMode, setShippingMode] = useState('Lo-Lo');
  const [vesselType, setVesselType] = useState('Geared Breakbulk (Lo-Lo)');

  const [storageDays, setStorageDays] = useState(0);
  const [surveyorCost, setSurveyorCost] = useState(0);
  const [inlandCost, setInlandCost] = useState(0);
  const [customsCost, setCustomsCost] = useState(0);
  const userEditedSurveyor = useRef(false);

  const [estimatedCost, setEstimatedCost] = useState('');
  const [salePrice, setSalePrice] = useState('');

  const setDunnage = setDunnageWood;
  const setChains = setChainsBinders;
  const setSlings = setHighCapacitySlings;
  const setGangs = setStevedoreGangs;
  const setHeavyLift = setHeavyLiftCrane;
  const setLashingTeams = setLashingTeam;

  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/forwarder-projects', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: No se pudo recuperar los proyectos.`);
      }

      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.projects || []);
      setProjects(list);

      if (activeProject) {
        const updated = list.find((p) => p.id === activeProject.id || p.project_ref === activeProject.project_ref);
        if (updated) {
          setActiveProject(updated);
        }
      }
    } catch (err) {
      console.error('[ForwarderWorkspace] Error al consultar proyectos:', err);
      setError(err?.message || 'Error de conexión al cargar proyectos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async () => {
    const input = window.prompt('Introduce el nombre del cliente para el nuevo proyecto / expediente:');
    if (input === null) return;
    const clientName = input.trim();
    if (!clientName) {
      window.alert('El nombre del cliente no puede estar vacío.');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/.netlify/functions/forwarder-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ client_name: clientName }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(errorPayload.error || `Error ${res.status} al crear el proyecto.`);
      }

      const payload = await res.json();
      const createdProject = payload.project || payload;

      setProjects((prev) => [createdProject, ...prev]);
      setActiveProject(createdProject);
    } catch (err) {
      console.error('[ForwarderWorkspace] Error al crear proyecto:', err);
      window.alert(`No se pudo crear el proyecto: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleTriggerImport = () => {
    if (fileInputRef.current && !isAnalyzingFile) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    setIsAnalyzingFile(true);

    try {
      const parsedItems = await parsePackingListFile(file);

      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        const formattedItems = parsedItems.map((it, idx) => ({
          id: it.id || Date.now() + idx,
          quantity: it.quantity != null ? it.quantity : 1,
          type: it.type || it.description || 'Pieza Proyecto',
          length: it.length_m != null ? it.length_m : (it.length != null ? it.length : 1),
          width: it.width_m != null ? it.width_m : (it.width != null ? it.width : 1),
          height: it.height_m != null ? it.height_m : (it.height != null ? it.height : 1),
          weight: it.unit_weight_kg != null ? it.unit_weight_kg : (it.weight != null ? it.weight : 1000),
        }));

        setCargoItems(formattedItems);
      } else {
        console.warn('[Project Cargo Builder] No se detectaron líneas estructuradas.');
      }
    } catch (err) {
      console.error('[Project Cargo Builder] Error parseando:', err);
    } finally {
      setIsAnalyzingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (event?.target) event.target.value = '';
    }
  };

  const handleAddCargoPiece = () => {
    setCargoItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        quantity: 1,
        type: '',
        length: '',
        width: '',
        height: '',
        weight: '',
      },
    ]);
  };

  const handleUpdateCargoItem = (id, field, value) => {
    setCargoItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          [field]: value,
        };
      })
    );
  };

  const handleRemoveCargoItem = (id) => {
    setCargoItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totals = cargoItems.reduce(
    (acc, item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const l = Math.max(0, parseFloat(item.length) || 0);
      const w = Math.max(0, parseFloat(item.width) || 0);
      const h = Math.max(0, parseFloat(item.height) || 0);
      const wt = Math.max(0, parseFloat(item.weight) || 0);

      acc.quantity += qty;
      acc.m2 += qty * (l * w);
      acc.m3 += qty * (l * w * h);
      acc.weight += qty * wt;
      return acc;
    },
    { quantity: 0, m2: 0, m3: 0, weight: 0 }
  );

  const autoCalculateEstimates = (items) => {
    if (!items || items.length === 0) {
      setDunnage(0);
      setChains(0);
      setSlings(0);
      setShackles(0);
      setGangs(0);
      setHeavyLift(0);
      setMafiPlatforms(0);
      setLashingTeams(0);
      setShippingMode('Lo-Lo');
      setVesselType('Geared Breakbulk (Lo-Lo)');
      setEstimatedCost('');
      setSalePrice('');
      return;
    }

    let totalPieces = 0;
    let totalWeightKg = 0;
    let totalVolumeM3 = 0;
    let total_m2 = 0;
    let maxPieceWeight = 0;
    let roRoItems = 0;
    const staticItems = [];

    const roRoRegex = /camion|vehiculo|trailer|tractor|coche|furgoneta/i;

    items.forEach((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const l = Math.max(0, parseFloat(String(item.length ?? 0).replace(',', '.')) || 0);
      const w = Math.max(0, parseFloat(String(item.width ?? 0).replace(',', '.')) || 0);
      const h = Math.max(0, parseFloat(String(item.height ?? 0).replace(',', '.')) || 0);
      const pieceWeight = Math.max(0, parseFloat(String(item.weight ?? 0).replace(',', '.')) || 0);

      totalPieces += qty;
      totalWeightKg += qty * pieceWeight;
      totalVolumeM3 += qty * (l * w * h);
      total_m2 += qty * (l * w);

      if (pieceWeight > maxPieceWeight) {
        maxPieceWeight = pieceWeight;
      }

      const rawType = String(item.type || '');
      const normalizedType = rawType.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (roRoRegex.test(rawType) || roRoRegex.test(normalizedType)) {
        roRoItems += qty;
      } else {
        staticItems.push({
          ...item,
          qty,
          quantity: qty,
          pieceWeight,
          weight: pieceWeight,
        });
      }
    });

    const autoMode = roRoItems > 0 ? 'Ro-Ro' : 'Lo-Lo';
    const recommendedVessel = roRoItems > 0 ? 'MPP / Pure Ro-Ro Carrier' : 'Geared Breakbulk (Lo-Lo)';

    setShippingMode(autoMode);
    setVesselType(recommendedVessel);

    const totalWeightTons = totalWeightKg / 1000;

    const Dunnage = Math.ceil(totalWeightTons / 5);
    const Cadenas = roRoItems * 4;
    const Eslingas = Math.ceil(totalPieces / 2);
    const Grilletes = (Eslingas * 2) + (Cadenas * 2);

    let HeavyLift = 0;
    let MAFIs = 0;
    let Gangs = 0;

    if (autoMode === 'Ro-Ro') {
      HeavyLift = 0;
      MAFIs = staticItems.reduce((acc, it) => {
        const wt = Math.max(0, parseFloat(String(it.pieceWeight ?? 0).replace(',', '.')) || 0);
        const q = Math.max(1, Number(it.qty) || 1);
        return acc + (wt > 5000 ? q : 0);
      }, 0);
      Gangs = Math.ceil(totalPieces / 25);
    } else {
      MAFIs = 0;
      HeavyLift = maxPieceWeight >= 8000 ? 1 : 0;
      Gangs = Math.ceil(totalPieces / 15);
    }

    setDunnage(Dunnage);
    setChains(Cadenas);
    setSlings(Eslingas);
    setShackles(Grilletes);
    setGangs(Gangs);
    setHeavyLift(HeavyLift);
    setMafiPlatforms(MAFIs);
    setLashingTeams(cargoItems.length > 0 ? Math.max(1, Math.ceil(totalPieces / 20) + (roRoItems > 0 ? 1 : 0)) : 0);

    let currentSurveyorCost = Number(surveyorCost) || 0;
    if (maxPieceWeight > 35000 && Number(surveyorCost) === 0 && !userEditedSurveyor.current) {
      currentSurveyorCost = 1500;
      setSurveyorCost(1500);
    }

    const RT = Math.max(totalWeightTons, totalVolumeM3);
    const freightCost = RT * 65;
    const lashingCost = (Dunnage * 30) + (Cadenas * 80) + (Eslingas * 40) + (Grilletes * 15);
    const stevedoringCost = (MAFIs * 300) + (HeavyLift * 2500) + (Gangs * 1200);
    const terminalStorageCost = Math.ceil(total_m2) * storageDays * 2;

    const totalEstimatedCost =
      freightCost +
      lashingCost +
      stevedoringCost +
      terminalStorageCost +
      (currentSurveyorCost || Number(surveyorCost) || 0) +
      (Number(inlandCost) || 0) +
      (Number(customsCost) || 0);

    setEstimatedCost(totalEstimatedCost.toFixed(2));
    setSalePrice((totalEstimatedCost * 1.15).toFixed(2));
  };

  useEffect(() => {
    autoCalculateEstimates(cargoItems);
  }, [cargoItems, storageDays, surveyorCost, inlandCost, customsCost]);

  const handleOpenCreateService = () => {
    setEditingLineItemId(null);
    setCargoItems([]);
    setDunnageWood(0);
    setHighCapacitySlings(0);
    setChainsBinders(0);
    setShackles(0);
    setStevedoreGangs(0);
    setLashingTeam(0);
    setHeavyLiftCrane(0);
    setMafiPlatforms(0);
    setShippingMode('Lo-Lo');
    setVesselType('Geared Breakbulk (Lo-Lo)');
    setStorageDays(0);
    setSurveyorCost(0);
    setInlandCost(0);
    setCustomsCost(0);
    userEditedSurveyor.current = false;
    setEstimatedCost('');
    setSalePrice('');
    setIsCargoModalOpen(true);
  };

  const handleEditService = (item) => {
    if (!item) return;
    setEditingLineItemId(item.id);

    const payload = item.payload_data;
    if (payload) {
      if (Array.isArray(payload.cargo_items)) {
        setCargoItems(
          payload.cargo_items.map((ci) => ({
            id: ci.id || `item-${Date.now()}-${Math.random()}`,
            quantity: ci.quantity || 1,
            type: ci.type || '',
            length: ci.length_m ?? ci.length ?? '',
            width: ci.width_m ?? ci.width ?? '',
            height: ci.height_m ?? ci.height ?? '',
            weight: ci.unit_weight_kg ?? ci.weight ?? '',
          }))
        );
      } else {
        setCargoItems([]);
      }

      const mats = payload.lashing_and_dunnage_materials || {};
      setDunnageWood(mats.dunnage_wood || 0);
      setHighCapacitySlings(mats.high_capacity_slings || 0);
      setChainsBinders(mats.chains_and_binders || 0);
      setShackles(mats.shackles || 0);

      const labor = payload.port_labor_and_equipment || {};
      setStevedoreGangs(labor.stevedore_gangs_shifts || 0);
      setLashingTeam(labor.lashing_team || 0);
      setHeavyLiftCrane(labor.heavy_lift_crane || 0);
      setMafiPlatforms(labor.mafi_platforms ?? labor.mafiPlatforms ?? 0);
      if (payload.shipping_mode) setShippingMode(payload.shipping_mode);
      if (payload.recommended_vessel) setVesselType(payload.recommended_vessel);

      const peri = payload.peripheral_services || {};
      setStorageDays(peri.storage_days ?? peri.storageDays ?? 0);
      setSurveyorCost(peri.surveyor_cost ?? peri.surveyorCost ?? 0);
      setInlandCost(peri.inland_cost ?? peri.inlandCost ?? 0);
      setCustomsCost(peri.customs_cost ?? peri.customsCost ?? 0);
      userEditedSurveyor.current = (peri.surveyor_cost ?? peri.surveyorCost) != null;

      const fin = payload.financial_summary || {};
      setEstimatedCost(fin.estimated_total_cost_eur != null ? String(fin.estimated_total_cost_eur) : (item.cost_eur != null ? String(item.cost_eur) : ''));
      setSalePrice(fin.customer_sale_price_eur != null ? String(fin.customer_sale_price_eur) : (item.sale_price_eur != null ? String(item.sale_price_eur) : ''));
    }
    setIsCargoModalOpen(true);
  };

  const handleDeleteService = (itemId) => {
    if (!activeProject) return;
    const confirmDelete = window.confirm('¿Seguro que deseas eliminar este servicio?');
    if (!confirmDelete) return;

    const existingItems = activeProject.line_items || activeProject.services || [];
    const updatedLineItems = existingItems.filter((line) => line.id !== itemId);
    const updatedProject = {
      ...activeProject,
      line_items: updatedLineItems,
      services: updatedLineItems,
    };

    setActiveProject(updatedProject);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id || p.project_ref === activeProject.project_ref ? updatedProject : p
      )
    );

    setSaveSuccessMessage('Servicio eliminado.');
    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 3500);
  };

  const handleSaveProjectCargo = () => {
    const terminalStorageCost = Math.ceil(totals.m2) * (Number(storageDays) || 0) * 2;
    const finalSurveyorCost = Number(surveyorCost) || 0;
    const finalInlandCost = Number(inlandCost) || 0;
    const finalCustomsCost = Number(customsCost) || 0;

    const payload = {
      project_id: activeProject?.id,
      project_ref: activeProject?.project_ref,
      client_name: activeProject?.client_name,
      cargo_category: 'Breakbulk / Ro-Ro (Project Cargo)',
      cargo_items: cargoItems.map((item) => {
        const l = parseFloat(item.length) || 0;
        const w = parseFloat(item.width) || 0;
        const h = parseFloat(item.height) || 0;
        const wt = parseFloat(item.weight) || 0;
        const qty = parseInt(item.quantity, 10) || 1;
        return {
          id: item.id,
          quantity: qty,
          type: item.type || 'Sin especificar',
          length_m: l,
          width_m: w,
          height_m: h,
          unit_weight_kg: wt,
          unit_m2: l * w,
          unit_m3: l * w * h,
          total_m2: qty * (l * w),
          total_m3: qty * (l * w * h),
          total_weight_kg: qty * wt,
        };
      }),
      lashing_and_dunnage_materials: {
        dunnage_wood: Number(dunnageWood) || 0,
        high_capacity_slings: Number(highCapacitySlings) || 0,
        chains_and_binders: Number(chainsBinders) || 0,
        shackles: Number(shackles) || 0,
      },
      port_labor_and_equipment: {
        stevedore_gangs_shifts: Number(stevedoreGangs) || 0,
        lashing_team: Number(lashingTeam) || 0,
        heavy_lift_crane: Number(heavyLiftCrane) || 0,
        mafi_platforms: Number(mafiPlatforms) || 0,
      },
      shipping_mode: shippingMode,
      recommended_vessel: vesselType,
      peripheral_services: {
        storage_days: Number(storageDays) || 0,
        terminal_storage_cost: terminalStorageCost,
        surveyor_cost: finalSurveyorCost,
        inland_cost: finalInlandCost,
        customs_cost: finalCustomsCost,
      },
      financial_summary: {
        estimated_total_cost_eur: parseFloat(estimatedCost) || 0,
        customer_sale_price_eur: parseFloat(salePrice) || 0,
        estimated_margin_eur: (parseFloat(salePrice) || 0) - (parseFloat(estimatedCost) || 0),
      },
      aggregated_totals: {
        total_pieces: totals.quantity,
        total_m2: totals.m2,
        total_m3: totals.m3,
        total_weight_kg: totals.weight,
      },
    };

    const lineItemCost = parseFloat(estimatedCost) || 0;
    const lineItemPrice = parseFloat(salePrice) || 0;
    const lineItemMargin = lineItemPrice - lineItemCost;
    const lineItemDescription = `Flete y Estiba Project Cargo (${totals.quantity} piezas, ${totals.m3.toFixed(2)} m³, ${totals.weight.toLocaleString('es-ES')} kg)`;

    const savedLineItem = {
      id: editingLineItemId || `item-${Date.now()}`,
      created_at: new Date().toISOString(),
      service_type: 'PROJECT_CARGO',
      description: lineItemDescription,
      category: 'Breakbulk / Ro-Ro (Project Cargo)',
      cost_eur: lineItemCost,
      sale_price_eur: lineItemPrice,
      margin_eur: lineItemMargin,
      payload_data: payload,
    };

    if (activeProject) {
      const existingItems = activeProject.line_items || activeProject.services || [];
      let updatedLineItems;
      if (editingLineItemId) {
        updatedLineItems = existingItems.map((li) => li.id === editingLineItemId ? savedLineItem : li);
      } else {
        updatedLineItems = [...existingItems, savedLineItem];
      }

      const updatedProject = {
        ...activeProject,
        line_items: updatedLineItems,
        services: updatedLineItems,
      };

      setActiveProject(updatedProject);
      setProjects((prev) =>
        prev.map((p) => p.id === activeProject.id || p.project_ref === activeProject.project_ref ? updatedProject : p)
      );
    }

    setIsCargoModalOpen(false);
    setSaveSuccessMessage('¡Servicio de Project Cargo guardado correctamente!');
    setTimeout(() => { setSaveSuccessMessage(null); }, 4500);
  };

  const renderStatusBadge = (status) => {
    const rawStatus = String(status || 'BORRADOR').toUpperCase();
    let badgeClasses = 'bg-amber-500/10 text-amber-400 border-amber-500/30';

    if (rawStatus === 'ACTIVO' || rawStatus === 'CONFIRMADO' || rawStatus === 'COMPLETADO') {
      badgeClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    } else if (rawStatus === 'EN PROCESO' || rawStatus === 'COTIZACION') {
      badgeClasses = 'bg-sky-500/10 text-sky-400 border-sky-500/30';
    } else if (rawStatus === 'CANCELADO') {
      badgeClasses = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wider uppercase ${badgeClasses}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>
        {rawStatus}
      </span>
    );
  };

  const formatCreationDate = (item) => {
    if (item.date) return item.date;
    if (item.created_at) {
      try {
        const d = new Date(item.created_at);
        if (!isNaN(d.getTime())) return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch (_) {}
    }
    return 'Reciente';
  };

  return (
    <>
      <div className={`w-full h-full flex overflow-hidden bg-slate-950 text-slate-100 font-sans relative ${showExecutiveReport ? 'print:hidden' : 'print:bg-white print:overflow-visible print:h-auto'}`}>
        {/* Sidebar */}
        <aside className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden print:hidden">
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden="true">💼</span>
                <div>
                  <h2 className="text-xs font-black text-slate-100 uppercase tracking-wider">Transitarios B2B</h2>
                  <p className="text-[10px] text-slate-400 font-medium">Expedientes & Proyectos</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleCreateProject}
              disabled={isCreating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isCreating ? <span>Creando...</span> : <span>+ Nuevo Proyecto</span>}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {isLoading ? (
              <div className="text-center py-10 text-slate-400 text-xs">Cargando...</div>
            ) : projects.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">No hay proyectos.</div>
            ) : (
              projects.map((proj) => {
                const isSelected = activeProject && (activeProject.id === proj.id || activeProject.project_ref === proj.project_ref);
                return (
                  <div
                    key={proj.id || proj.project_ref}
                    onClick={() => setActiveProject(proj)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelected ? 'bg-slate-800/95 border-blue-500 shadow-md' : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-[11px] font-bold text-sky-400">{proj.project_ref || 'EXP-SIN-REF'}</span>
                      {renderStatusBadge(proj.status)}
                    </div>
                    <h3 className="font-bold text-slate-200 text-sm truncate">{proj.client_name}</h3>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Main Area */}
        <main className="flex-1 bg-slate-50 flex flex-col h-full overflow-y-auto print:hidden">
          {saveSuccessMessage && (
            <div className="m-4 mb-0 p-3 bg-emerald-100 border border-emerald-300 rounded-xl flex items-center justify-between text-emerald-900 text-xs font-semibold shadow-sm">
              <div className="flex items-center gap-2">
                <span>✅</span> <span>{saveSuccessMessage}</span>
              </div>
              <button onClick={() => setSaveSuccessMessage(null)} className="text-emerald-700">✕</button>
            </div>
          )}

          {!activeProject ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600">
              <div className="text-3xl mb-4">💼</div>
              <h3 className="text-xl font-black text-slate-800">Expediente de Transitario</h3>
              <p className="mt-2 max-w-md text-xs">Selecciona o crea un proyecto para continuar.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-6 md:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between gap-4 pb-6 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-xs font-bold text-slate-600 bg-slate-200/80 px-2.5 py-0.5 rounded border border-slate-300">
                      {activeProject.project_ref || 'EXP-SIN-REF'}
                    </span>
                    {renderStatusBadge(activeProject.status)}
                  </div>
                  <h1 className="text-3xl font-bold text-slate-900">{activeProject.client_name}</h1>
                </div>
              </div>

              {activeProject.line_items && activeProject.line_items.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900">Servicios del Expediente</h3>
                    <button
                      onClick={handleOpenCreateService}
                      className="px-4 py-2 bg-blue-600 text-white font-bold text-xs uppercase rounded-lg shadow-sm"
                    >
                      ➕ Añadir Servicio
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-100 font-bold uppercase border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Servicio</th>
                          <th className="px-4 py-3 text-right">Coste (€)</th>
                          <th className="px-4 py-3 text-right">Venta (€)</th>
                          <th className="px-4 py-3 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeProject.line_items.map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td className="px-4 py-3 font-semibold text-slate-900">{item.description}</td>
                            <td className="px-4 py-3 text-right text-rose-600 font-bold">
                              {Number(item.cost_eur || 0).toLocaleString('es-ES')} €
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-600 font-bold">
                              {Number(item.sale_price_eur || 0).toLocaleString('es-ES')} €
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => handleEditService(item)} className="mx-1 text-blue-600">✏️</button>
                              <button onClick={() => handleDeleteService(item.id)} className="mx-1 text-rose-600">🗑️</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 flex flex-col items-center text-center bg-white">
                  <h4 className="text-base font-bold text-slate-800 mb-4">No hay servicios</h4>
                  <button onClick={handleOpenCreateService} className="px-5 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-lg">
                    ➕ Añadir Servicio
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ======================================================== */}
        {/* MODAL: PROJECT CARGO BUILDER                             */}
        {/* ======================================================== */}
        {isCargoModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 sm:p-6 overflow-y-auto print:hidden">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100">
              
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-black text-slate-100">Project Cargo Builder</h2>
                <button onClick={() => setIsCargoModalOpen(false)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 divide-y divide-slate-800/70">
                
                {/* SECCIÓN 1: Packing List */}
                <section className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-sky-400 uppercase">1. Lista de Empaque</h3>
                    <div className="flex gap-2">
                      <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                      <button onClick={handleTriggerImport} className="px-3 py-1.5 bg-violet-900 text-white text-xs font-bold rounded-lg">🤖 PDF/Excel</button>
                      <button onClick={handleAddCargoPiece} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg">➕ Pieza</button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/90 font-bold text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-2 w-16">Cant.</th>
                          <th className="px-3 py-2">Tipo/Modelo</th>
                          <th className="px-3 py-2 w-20">L (m)</th>
                          <th className="px-3 py-2 w-20">W (m)</th>
                          <th className="px-3 py-2 w-20">H (m)</th>
                          <th className="px-3 py-2 w-28">Peso (kg)</th>
                          <th className="px-3 py-2 w-10 text-center">🗑️</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {cargoItems.map((item) => (
                          <tr key={item.id}>
                            <td className="px-2 py-2"><input type="number" min={1} value={item.quantity} onChange={(e) => handleUpdateCargoItem(item.id, 'quantity', e.target.value)} className="w-full bg-slate-950 border border-slate-700 px-1 py-1 text-slate-100" /></td>
                            <td className="px-2 py-2"><input type="text" value={item.type} onChange={(e) => handleUpdateCargoItem(item.id, 'type', e.target.value)} className="w-full bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100" /></td>
                            <td className="px-2 py-2"><input type="number" value={item.length} onChange={(e) => handleUpdateCargoItem(item.id, 'length', e.target.value)} className="w-full bg-slate-950 border border-slate-700 px-1 py-1 text-slate-100" /></td>
                            <td className="px-2 py-2"><input type="number" value={item.width} onChange={(e) => handleUpdateCargoItem(item.id, 'width', e.target.value)} className="w-full bg-slate-950 border border-slate-700 px-1 py-1 text-slate-100" /></td>
                            <td className="px-2 py-2"><input type="number" value={item.height} onChange={(e) => handleUpdateCargoItem(item.id, 'height', e.target.value)} className="w-full bg-slate-950 border border-slate-700 px-1 py-1 text-slate-100" /></td>
                            <td className="px-2 py-2"><input type="number" value={item.weight} onChange={(e) => handleUpdateCargoItem(item.id, 'weight', e.target.value)} className="w-full bg-slate-950 border border-slate-700 px-1 py-1 text-slate-100" /></td>
                            <td className="px-2 py-2 text-center"><button onClick={() => handleRemoveCargoItem(item.id)} className="text-rose-500 font-bold">X</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* SECCIÓN 2: Trincaje */}
                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-sky-400 uppercase">2. Trincaje y Materiales</h3>
                  
                  {/* FIX BANNER IA: Sin morado, 100% Dark Tech */}
                  <div className="bg-white border border-slate-200 border-l-4 border-l-cyan-500 p-4 rounded shadow-sm flex items-center gap-4 mb-6">
  <div className="text-2xl">⚙️</div>
  <div className="flex flex-col">
    <span className="text-cyan-600 font-bold text-sm tracking-wide uppercase">Motor de Decisión Operativa IA</span>
    <span className="text-slate-600 mt-1 text-xs">
      Modalidad detectada: <strong className="bg-white text-slate-900 border border-slate-300 px-2 py-0.5 rounded shadow-sm mx-1">{shippingMode}</strong>
      Buque recomendado: <strong className="text-slate-900">{vesselType}</strong>
    </span>
  </div>
</div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <NumericCounter label="Maderas" value={dunnageWood} onChange={setDunnageWood} />
                    <NumericCounter label="Eslingas" value={highCapacitySlings} onChange={setHighCapacitySlings} />
                    <NumericCounter label="Cadenas" value={chainsBinders} onChange={setChainsBinders} />
                    <NumericCounter label="Grilletes" value={shackles} onChange={setShackles} />
                  </div>
                </section>

                {/* SECCIÓN 3: Mano de Obra */}
                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-sky-400 uppercase">3. Mano de Obra Portuaria</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <NumericCounter label="Turnos Estiba" value={stevedoreGangs} onChange={setStevedoreGangs} />
                    <NumericCounter label="Eq. Trincadores" value={lashingTeam} onChange={setLashingTeam} />
                    <NumericCounter label="Grúas Heavy Lift" value={heavyLiftCrane} onChange={setHeavyLiftCrane} />
                    <NumericCounter label="Plataformas MAFI" value={mafiPlatforms} onChange={setMafiPlatforms} />
                  </div>
                </section>

                {/* SECCIÓN 4: Periféricos */}
                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-sky-400 uppercase">4. Pre-Carriage & Port</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <label className="text-xs font-bold text-slate-200 block mb-2">Días Almacenaje</label>
                      <input type="number" value={storageDays} onChange={(e) => setStorageDays(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white" />
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <label className="text-xs font-bold text-slate-200 block mb-2">Surveyor (€)</label>
                      <input type="number" value={surveyorCost} onChange={(e) => { userEditedSurveyor.current = true; setSurveyorCost(e.target.value); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white" />
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <label className="text-xs font-bold text-slate-200 block mb-2">Transporte Inland (€)</label>
                      <input type="number" value={inlandCost} onChange={(e) => setInlandCost(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white" />
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <label className="text-xs font-bold text-slate-200 block mb-2">Aduanas (€)</label>
                      <input type="number" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white" />
                    </div>
                  </div>
                </section>
              </div>

              {/* FOOTER DEL MODAL */}
              <div className="bg-slate-900 p-6 rounded-b-lg border-t border-slate-700 flex justify-between items-end mt-6 shrink-0">
                <div className="flex gap-6 w-2/3">
                  <div className="w-1/2">
                    <label className="block text-cyan-400 font-bold text-xs mb-1">COSTE TOTAL ESTIMADO (€)</label>
                    <input type="number" readOnly value={estimatedCost} className="!bg-slate-900 !text-white !font-bold !text-2xl !border-slate-600 focus:!border-cyan-500 rounded p-3 w-full text-right outline-none transition-colors border shadow-inner" />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-cyan-400 font-bold text-xs mb-1">PRECIO VENTA A CLIENTE (€)</label>
                    <input type="number" readOnly value={salePrice} className="!bg-slate-900 !text-white !font-bold !text-2xl !border-slate-600 focus:!border-cyan-500 rounded p-3 w-full text-right outline-none transition-colors border shadow-inner" />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button onClick={() => setShowExecutiveReport(true)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded font-bold">📄 Reporte Ejecutivo</button>
                  <button onClick={handleSaveProjectCargo} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded font-bold">💾 GUARDAR PROYECTO</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* VISTA DEL REPORTE EJECUTIVO (PRINT-READY)                */}
      {/* ======================================================== */}
      {showExecutiveReport && (() => {
        const totalWeightTons = (totals.weight || 0) / 1000;
        const totalVolumeM3 = totals.m3 || 0;
        const reportRT = Math.max(totalWeightTons, totalVolumeM3);

        const calculatedTotalCost = parseFloat(estimatedCost) || 0;
        const finalTotalSale = parseFloat(salePrice) || 0;
        const finalTotalMargin = finalTotalSale - calculatedTotalCost;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] overflow-y-auto p-4 sm:p-10 print:p-0 print:bg-white text-slate-900">
            <style>{`
              @media print {
                body { background-color: #ffffff !important; color: #0f172a !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                @page { size: A4 portrait; margin: 12mm 15mm; }
                .print-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
            `}</style>

            {/* BOTONERA CLÁSICA - ANCLADA JUSTO ENCIMA DEL FOLIO PARA QUE NO DESAPAREZCA */}
            <div className="max-w-4xl mx-auto flex justify-end gap-4 mb-4 print:hidden">
              <button onClick={(e) => { e.preventDefault(); window.print(); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow-lg font-bold flex items-center gap-2 cursor-pointer border border-blue-500">
                🖨️ Imprimir / PDF
              </button>
              <button onClick={(e) => { e.preventDefault(); setShowExecutiveReport(false); }} className="bg-white hover:bg-slate-50 text-slate-800 px-6 py-2.5 rounded-lg shadow-lg font-bold flex items-center gap-2 cursor-pointer border border-slate-300">
                ✖ Cerrar Reporte
              </button>
            </div>

            {/* FOLIO A4 BLANCO */}
            <div className="max-w-4xl mx-auto p-10 bg-white text-slate-900 shadow-2xl border border-slate-200 rounded-lg print:shadow-none print:border-none print:max-w-full print-exact">

            <div className="max-w-4xl mx-auto p-10 bg-white text-slate-900 my-8 shadow-2xl border border-slate-200 rounded-lg print:my-0 print:p-8 print:shadow-none print:border-none print:max-w-full print-exact">
              <header className="border-b-2 border-slate-900 pb-6 mb-6">
                <div className="flex justify-between gap-4 mb-4">
                  <div>
                    <h1 className="text-xl font-black text-slate-900 uppercase">Universal Forwarding / B2B</h1>
                    <p className="text-xs text-slate-600">División Carga de Proyecto</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-600 font-bold">Referencia: {activeProject?.project_ref}</p>
                    <p className="text-xs text-blue-900 font-bold">Cliente: {activeProject?.client_name}</p>
                  </div>
                </div>
                <h1 className="text-2xl font-black uppercase text-slate-900">OFERTA COMERCIAL - PROJECT CARGO</h1>
              </header>

              <section className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 print-exact">
                <h3 className="text-xs font-black uppercase text-slate-700 mb-3">📊 Resumen Operativo</h3>
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-white p-3 border border-slate-200 rounded print-exact">
                    <p className="text-[10px] uppercase font-bold">M³ Total</p>
                    <p className="text-lg font-black">{totals.m3.toFixed(2)}</p>
                  </div>
                  <div className="bg-white p-3 border border-slate-200 rounded print-exact">
                    <p className="text-[10px] uppercase font-bold">Peso Total</p>
                    <p className="text-lg font-black">{totalWeightTons.toFixed(2)} Tons</p>
                  </div>
                  <div className="bg-white p-3 border border-slate-200 rounded print-exact">
                    <p className="text-[10px] uppercase font-bold">Modalidad</p>
                    <p className="text-lg font-black text-sky-700">{shippingMode}</p>
                  </div>
                  <div className="bg-white p-3 border border-slate-200 rounded print-exact">
                    <p className="text-[10px] uppercase font-bold">Buque</p>
                    <p className="text-sm font-black">{vesselType}</p>
                  </div>
                </div>
              </section>

              <div className="bg-slate-900 text-white p-6 rounded-2xl mb-6 flex justify-between print-exact mt-12">
                <div>
                  <h2 className="text-2xl font-black uppercase">PRECIO TOTAL DE VENTA</h2>
                  <p className="text-xs text-slate-400">Tarifa all-in de flete y operaciones</p>
                </div>
                <div className="text-right bg-slate-800 p-4 rounded-xl print-exact">
                  <div className="text-4xl font-black text-emerald-400">{(finalTotalSale).toLocaleString('es-ES')} €</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 pt-12 text-center mt-20">
                <div>
                  <div className="border-b border-slate-400 pb-12 mb-2"></div>
                  <p className="text-xs font-bold text-slate-800">Por Universal Forwarding</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-12 mb-2"></div>
                  <p className="text-xs font-bold text-slate-800">Firma del Cliente</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

export default ForwarderWorkspace;
