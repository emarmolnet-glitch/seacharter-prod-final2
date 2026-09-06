import React, { useState, useEffect, useRef } from 'react';
import { parsePackingListFile } from '../utils/packingListParser.js';

function NumericCounter({ label, subtitle, value, onChange, min = 0 }) {
  const numValue = Number(value) || 0;

  const handleDecrement = () => {
    if (numValue > min) onChange(numValue - 1);
  };

  const handleIncrement = () => {
    onChange(numValue + 1);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between hover:border-blue-300 transition shadow-sm">
      <div className="mb-2">
        <span className="block text-xs font-bold text-slate-800 tracking-wide">{label}</span>
        {subtitle && <span className="block text-[11px] text-slate-500 mt-0.5">{subtitle}</span>}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Unidades</span>
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={numValue <= min}
            className="w-7 h-7 flex items-center justify-center rounded bg-white hover:bg-slate-200 border border-slate-200 text-slate-700 disabled:opacity-30 text-base font-black transition cursor-pointer shadow-sm"
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
            className="w-14 text-center bg-transparent text-sm font-mono font-bold text-blue-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={handleIncrement}
            className="w-7 h-7 flex items-center justify-center rounded bg-white hover:bg-slate-200 border border-slate-200 text-slate-700 text-base font-black transition cursor-pointer shadow-sm"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

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

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.projects || []);
      setProjects(list);

      if (activeProject) {
        const updated = list.find((p) => p.id === activeProject.id || p.project_ref === activeProject.project_ref);
        if (updated) setActiveProject(updated);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Error de conexión');
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
    if (!clientName) return;

    setIsCreating(true);
    try {
      const res = await fetch('/.netlify/functions/forwarder-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_name: clientName }),
      });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      const createdProject = payload.project || payload;
      setProjects((prev) => [createdProject, ...prev]);
      setActiveProject(createdProject);
    } catch (err) {
      window.alert('No se pudo crear el proyecto.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleTriggerImport = () => {
    if (fileInputRef.current && !isAnalyzingFile) fileInputRef.current.click();
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
          category: it.category || 'Equipos de Proceso',
          quantity: it.quantity ?? 1,
          type: it.type || it.description || 'Pieza Proyecto',
          length: it.length_m ?? it.length ?? 1,
          width: it.width_m ?? it.width ?? 1,
          height: it.height_m ?? it.height ?? 1,
          weight: it.unit_weight_kg ?? it.weight ?? 1000,
          shipping_mode_supported: it.shipping_mode_supported || "40' HC Contenedor"
        }));
        setCargoItems(formattedItems);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddCargoPiece = () => {
    setCargoItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}-${Math.random()}`, category: 'Equipos de Proceso', quantity: 1, type: '', length: '', width: '', height: '', weight: '', shipping_mode_supported: "40' HC Contenedor" },
    ]);
  };

  const handleUpdateCargoItem = (id, field, value) => {
    setCargoItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
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
      setDunnage(0); setChains(0); setSlings(0); setShackles(0);
      setGangs(0); setHeavyLift(0); setMafiPlatforms(0); setLashingTeams(0);
      setShippingMode('Lo-Lo'); setVesselType('Geared Breakbulk (Lo-Lo)');
      setEstimatedCost(''); setSalePrice('');
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
      if (roRoRegex.test(rawType) || roRoRegex.test(rawType.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
        roRoItems += qty;
      } else {
        staticItems.push({ ...item, qty, quantity: qty, pieceWeight, weight: pieceWeight });
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

    let HeavyLift = 0; let MAFIs = 0; let Gangs = 0;
    if (autoMode === 'Ro-Ro') {
      HeavyLift = 0;
      MAFIs = staticItems.reduce((acc, it) => acc + (it.pieceWeight > 5000 ? it.qty : 0), 0);
      Gangs = Math.ceil(totalPieces / 25);
    } else {
      MAFIs = 0;
      HeavyLift = maxPieceWeight >= 8000 ? 1 : 0;
      Gangs = Math.ceil(totalPieces / 15);
    }

    setDunnage(Dunnage); setChains(Cadenas); setSlings(Eslingas); setShackles(Grilletes);
    setGangs(Gangs); setHeavyLift(HeavyLift); setMafiPlatforms(MAFIs);
    setLashingTeams(Math.max(1, Math.ceil(totalPieces / 20) + (roRoItems > 0 ? 1 : 0)));

    let currentSurveyorCost = Number(surveyorCost) || 0;
    if (maxPieceWeight > 35000 && Number(surveyorCost) === 0 && !userEditedSurveyor.current) {
      currentSurveyorCost = 1500; setSurveyorCost(1500);
    }

    const RT = Math.max(totalWeightTons, totalVolumeM3);
    const freightCost = RT * 65;
    const lashingCost = (Dunnage * 30) + (Cadenas * 80) + (Eslingas * 40) + (Grilletes * 15);
    const stevedoringCost = (MAFIs * 300) + (HeavyLift * 2500) + (Gangs * 1200);
    const terminalStorageCost = Math.ceil(total_m2) * storageDays * 2;

    const totalEstimatedCost = freightCost + lashingCost + stevedoringCost + terminalStorageCost + currentSurveyorCost + (Number(inlandCost) || 0) + (Number(customsCost) || 0);

    setEstimatedCost(totalEstimatedCost.toFixed(2));
    setSalePrice((totalEstimatedCost * 1.15).toFixed(2));
  };

  useEffect(() => {
    autoCalculateEstimates(cargoItems);
  }, [cargoItems, storageDays, surveyorCost, inlandCost, customsCost]);

  const handleOpenCreateService = () => {
    setEditingLineItemId(null); setCargoItems([]);
    setDunnageWood(0); setHighCapacitySlings(0); setChainsBinders(0); setShackles(0);
    setStevedoreGangs(0); setLashingTeam(0); setHeavyLiftCrane(0); setMafiPlatforms(0);
    setShippingMode('Lo-Lo'); setVesselType('Geared Breakbulk (Lo-Lo)');
    setStorageDays(0); setSurveyorCost(0); setInlandCost(0); setCustomsCost(0);
    userEditedSurveyor.current = false; setEstimatedCost(''); setSalePrice('');
    setIsCargoModalOpen(true);
  };

  const handleEditService = (item) => {
    if (!item) return;
    setEditingLineItemId(item.id);
    const payload = item.payload_data;
    if (payload) {
      if (Array.isArray(payload.cargo_items)) {
        setCargoItems(payload.cargo_items.map((ci) => ({
          id: ci.id || `item-${Date.now()}`,
          category: ci.category || 'Equipos de Proceso',
          quantity: ci.quantity || 1,
          type: ci.type || '',
          length: ci.length_m ?? '',
          width: ci.width_m ?? '',
          height: ci.height_m ?? '',
          weight: ci.unit_weight_kg ?? '',
          shipping_mode_supported: ci.shipping_mode_supported || "40' HC Contenedor"
        })));
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
      setMafiPlatforms(labor.mafi_platforms || 0);
      if (payload.shipping_mode) setShippingMode(payload.shipping_mode);
      if (payload.recommended_vessel) setVesselType(payload.recommended_vessel);
      const peri = payload.peripheral_services || {};
      setStorageDays(peri.storage_days || 0);
      setSurveyorCost(peri.surveyor_cost || 0);
      setInlandCost(peri.inland_cost || 0);
      setCustomsCost(peri.customs_cost || 0);
      const fin = payload.financial_summary || {};
      setEstimatedCost(fin.estimated_total_cost_eur ? String(fin.estimated_total_cost_eur) : '');
      setSalePrice(fin.customer_sale_price_eur ? String(fin.customer_sale_price_eur) : '');
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
  };

  const handleSaveProjectCargo = () => {
    const payload = {
      project_ref: activeProject?.project_ref,
      cargo_items: cargoItems.map((item) => ({
        category: item.category || 'Equipos de Proceso',
        quantity: parseInt(item.quantity, 10) || 1,
        type: item.type || 'Sin especificar',
        length_m: parseFloat(item.length) || 0,
        width_m: parseFloat(item.width) || 0,
        height_m: parseFloat(item.height) || 0,
        unit_weight_kg: parseFloat(item.weight) || 0,
        shipping_mode_supported: item.shipping_mode_supported || "40' HC Contenedor"
      })),
      financial_summary: {
        estimated_total_cost_eur: parseFloat(estimatedCost) || 0,
        customer_sale_price_eur: parseFloat(salePrice) || 0,
      }
    };

    const lineItemCost = parseFloat(estimatedCost) || 0;
    const lineItemPrice = parseFloat(salePrice) || 0;
    const savedLineItem = {
      id: editingLineItemId || `item-${Date.now()}`,
      description: `Flete y Estiba Project Cargo (${totals.quantity} piezas, ${totals.weight.toLocaleString('es-ES')} kg)`,
      cost_eur: lineItemCost,
      sale_price_eur: lineItemPrice,
      margin_eur: lineItemPrice - lineItemCost,
      payload_data: payload,
    };

    if (activeProject) {
      const existingItems = activeProject.line_items || [];
      const updatedLineItems = editingLineItemId ? existingItems.map((li) => (li.id === editingLineItemId ? savedLineItem : li)) : [...existingItems, savedLineItem];
      const updatedProject = { ...activeProject, line_items: updatedLineItems, services: updatedLineItems };
      setActiveProject(updatedProject);
      setProjects((prev) => prev.map((p) => p.id === activeProject.id ? updatedProject : p));
    }

    setIsCargoModalOpen(false);
    setSaveSuccessMessage('¡Flete y estiba guardados correctamente!');
    setTimeout(() => setSaveSuccessMessage(null), 3500);
  };

  return (
    <>
      <div className={`w-full h-full flex overflow-hidden bg-slate-900 text-slate-100 font-sans relative ${showExecutiveReport ? 'print:hidden' : ''}`}>
        <aside className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden print:hidden">
          <div className="p-4 border-b border-slate-800">
            <button
              onClick={handleCreateProject}
              disabled={isCreating}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase rounded-lg shadow-md cursor-pointer"
            >
              {isCreating ? 'Creando...' : '+ Nuevo Proyecto'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {projects.map((proj) => {
              const isSelected = activeProject && activeProject.id === proj.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => setActiveProject(proj)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-slate-800 border-blue-500' : 'bg-slate-900/60 border-slate-800'}`}
                >
                  <span className="font-mono text-[11px] text-sky-400">{proj.project_ref}</span>
                  <h3 className="font-bold text-slate-200 text-sm truncate">{proj.client_name}</h3>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 bg-slate-50 flex flex-col h-full overflow-y-auto print:hidden">
          {saveSuccessMessage && (
            <div className="m-4 p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-semibold">
              {saveSuccessMessage}
            </div>
          )}

          {!activeProject ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600">
              <h3 className="text-xl font-black text-slate-800">Expediente de Transitario</h3>
              <p className="mt-2 text-xs">Selecciona un proyecto para comenzar.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-6 space-y-6">
              <h1 className="text-3xl font-bold text-slate-900">{activeProject.client_name}</h1>
              {activeProject.line_items?.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-slate-900">Servicios</h3>
                    <button onClick={handleOpenCreateService} className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer">➕ Añadir Servicio</button>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 font-bold border-b border-slate-200 text-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-left">Servicio</th>
                          <th className="px-4 py-3 text-right">Coste (€)</th>
                          <th className="px-4 py-3 text-right">Venta (€)</th>
                          <th className="px-4 py-3 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {activeProject.line_items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-semibold">{item.description}</td>
                            <td className="px-4 py-3 text-right text-rose-600 font-bold">{Number(item.cost_eur).toLocaleString('es-ES')} €</td>
                            <td className="px-4 py-3 text-right text-emerald-600 font-bold">{Number(item.sale_price_eur).toLocaleString('es-ES')} €</td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => handleEditService(item)} className="mx-1 cursor-pointer hover:scale-110">✏️</button>
                              <button onClick={() => handleDeleteService(item.id)} className="mx-1 cursor-pointer hover:scale-110">🗑️</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 flex flex-col items-center bg-white">
                  <button onClick={handleOpenCreateService} className="px-5 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer">➕ Añadir Servicio</button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ==================================================== */}
        {/* MODAL PRINCIPAL: TEMA CLARO Y FULL-WIDTH             */}
        {/* ==================================================== */}
        {isCargoModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto print:hidden">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-[95%] max-h-[96vh] flex flex-col overflow-hidden text-slate-900 mt-6">
              
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Project Cargo Builder</h2>
                <button onClick={() => setIsCargoModalOpen(false)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center justify-center font-bold">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 divide-y divide-slate-100">
                
                {/* SECCIÓN 1: Packing List a Pantalla Completa */}
                <section className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">1. Lista de Empaque</h3>
                    <div className="flex gap-2">
                      <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                      <button onClick={handleTriggerImport} className="px-4 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg cursor-pointer shadow-sm transition">🤖 Importar Documento</button>
                      <button onClick={handleAddCargoPiece} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-sm transition">➕ Añadir Pieza</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    {/* Al remover w-full de los <th> de descripción y modos, estos absorben todo el espacio horizontal */}
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 font-bold text-slate-600 border-b border-slate-200 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="px-3 py-3 text-center w-16">Cant.</th>
                          <th className="px-3 py-3">Tipo / Modelo (Descripción completa)</th>
                          <th className="px-3 py-3 w-20 text-center">L (m)</th>
                          <th className="px-3 py-3 w-20 text-center">W (m)</th>
                          <th className="px-3 py-3 w-20 text-center">H (m)</th>
                          <th className="px-3 py-3 w-28 text-right">Peso (kg)</th>
                          <th className="px-3 py-3 w-12 text-center">🗑️</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cargoItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50">
                            <td className="px-2 py-2">
                              <input type="number" min={1} value={item.quantity} onChange={(e) => handleUpdateCargoItem(item.id, 'quantity', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1.5 text-slate-900 rounded text-center shadow-sm" />
                            </td>
                            <td className="px-2 py-2">
                              <input type="text" value={item.type} onChange={(e) => handleUpdateCargoItem(item.id, 'type', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-3 py-1.5 text-slate-900 font-semibold rounded shadow-sm" />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" value={item.length} onChange={(e) => handleUpdateCargoItem(item.id, 'length', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1.5 text-slate-900 rounded text-center shadow-sm" />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" value={item.width} onChange={(e) => handleUpdateCargoItem(item.id, 'width', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1.5 text-slate-900 rounded text-center shadow-sm" />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" value={item.height} onChange={(e) => handleUpdateCargoItem(item.id, 'height', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1.5 text-slate-900 rounded text-center shadow-sm" />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" value={item.weight} onChange={(e) => handleUpdateCargoItem(item.id, 'weight', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1.5 text-slate-900 rounded text-right shadow-sm font-mono" />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button onClick={() => handleRemoveCargoItem(item.id)} className="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1.5 rounded transition cursor-pointer font-bold">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* SECCIÓN 2: Trincaje */}
                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">2. Trincaje y Materiales</h3>
                  
                  <div className="bg-blue-50 border border-blue-200 border-l-4 border-l-blue-500 p-4 rounded-lg shadow-sm flex items-center gap-4 mb-6">
                    <div className="text-2xl">⚙️</div>
                    <div className="flex flex-col">
                      <span className="text-blue-800 font-black text-xs tracking-wide uppercase">Motor de Decisión Operativa IA</span>
                      <span className="text-slate-700 mt-1 text-[11px]">
                        Modalidad detectada: <strong className="bg-white text-blue-900 border border-blue-200 px-2 py-0.5 rounded shadow-sm mx-1">{shippingMode}</strong>
                        Buque recomendado: <strong className="text-slate-900 font-bold">{vesselType}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <NumericCounter label="Maderas" subtitle="Durmientes y Cuñas" value={dunnageWood} onChange={setDunnageWood} />
                    <NumericCounter label="Eslingas" subtitle="Textiles Alta Capacidad" value={highCapacitySlings} onChange={setHighCapacitySlings} />
                    <NumericCounter label="Cadenas" subtitle="Acero y Tensores" value={chainsBinders} onChange={setChainsBinders} />
                    <NumericCounter label="Grilletes" subtitle="Unión de Resistencia" value={shackles} onChange={setShackles} />
                  </div>
                </section>

                {/* SECCIÓN 3: Mano de Obra */}
                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">3. Mano de Obra Portuaria</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <NumericCounter label="Turnos Estiba" subtitle="Cuadrillas completas" value={stevedoreGangs} onChange={setStevedoreGangs} />
                    <NumericCounter label="Eq. Trincadores" subtitle="Especialistas" value={lashingTeam} onChange={setLashingTeam} />
                    <NumericCounter label="Grúas Heavy Lift" subtitle="Móvil Portuaria" value={heavyLiftCrane} onChange={setHeavyLiftCrane} />
                    <NumericCounter label="Plataformas MAFI" subtitle="Roll Trailers" value={mafiPlatforms} onChange={setMafiPlatforms} />
                  </div>
                </section>

                {/* SECCIÓN 4: Periféricos */}
                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">4. Pre-Carriage & Port</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                      <label className="text-xs font-bold text-slate-800 block mb-2">Días Almacenaje</label>
                      <input type="number" value={storageDays} onChange={(e) => setStorageDays(e.target.value)} className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded px-3 py-2 text-slate-900 text-sm shadow-inner" />
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                      <label className="text-xs font-bold text-slate-800 block mb-2">Surveyor (€)</label>
                      <input type="number" value={surveyorCost} onChange={(e) => { userEditedSurveyor.current = true; setSurveyorCost(e.target.value); }} className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded px-3 py-2 text-slate-900 text-sm shadow-inner" />
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                      <label className="text-xs font-bold text-slate-800 block mb-2">Transporte Inland (€)</label>
                      <input type="number" value={inlandCost} onChange={(e) => setInlandCost(e.target.value)} className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded px-3 py-2 text-slate-900 text-sm shadow-inner" />
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                      <label className="text-xs font-bold text-slate-800 block mb-2">Aduanas (€)</label>
                      <input type="number" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded px-3 py-2 text-slate-900 text-sm shadow-inner" />
                    </div>
                  </div>
                </section>
              </div>

              {/* FOOTER DEL MODAL TEMA CLARO */}
              <div className="bg-slate-50 p-6 border-t border-slate-200 flex justify-between items-end shrink-0">
                <div className="flex gap-6 w-2/3">
                  <div className="w-1/2">
                    <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">COSTE TOTAL ESTIMADO (€)</label>
                    <input type="number" readOnly value={estimatedCost} className="bg-white text-slate-900 font-black text-2xl border-slate-300 rounded-lg p-3 w-full text-right outline-none border shadow-inner" />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-blue-600 font-bold text-[10px] uppercase tracking-wider mb-1">PRECIO VENTA A CLIENTE (€)</label>
                    <input type="number" readOnly value={salePrice} className="bg-white text-slate-900 font-black text-2xl border-blue-300 focus:border-blue-500 rounded-lg p-3 w-full text-right outline-none border shadow-inner" />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button onClick={() => setShowExecutiveReport(true)} className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded-lg shadow font-bold cursor-pointer text-sm">📄 Generar Reporte</button>
                  <button onClick={handleSaveProjectCargo} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow font-bold cursor-pointer text-sm">💾 GUARDAR PROYECTO</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* VISTA DEL REPORTE EJECUTIVO (CROQUIS DE ESTIBA INTEGRADO Y FORMATO A4)    */}
      {/* ========================================================================= */}
      {showExecutiveReport && (() => {
        const totalWeightTons = (totals.weight || 0) / 1000;
        const totalVolumeM3 = totals.m3 || 0;
        const reportRT = Math.max(totalWeightTons, totalVolumeM3);
        const finalTotalCost = parseFloat(estimatedCost) || 0;
        const finalTotalSale = parseFloat(salePrice) || 0;
        const finalTotalMargin = finalTotalSale - finalTotalCost;

        const formatCurrency = (val) => Number(val || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

        const totalMetricUnits = cargoItems.reduce((sum, item) => {
          const qty = Number(item.quantity) || 1;
          const wt = parseFloat(item.weight) || 1000;
          return sum + (qty * wt);
        }, 0) || 1;

        return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2147483647] overflow-y-auto pt-24 pb-20 px-4 sm:px-12 text-slate-900">
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                #printable-a4-sheet, #printable-a4-sheet * { visibility: visible !important; }
                #printable-a4-sheet { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 15mm !important; box-shadow: none !important; border: none !important; background: #ffffff !important; }
                .print-hidden { display: none !important; }
                @page { size: A4 portrait; margin: 0; }
              }
            `}</style>

            {/* BOTONERA FIJA CLARAMENTE SEPARADA DEL HEADER SUPERIOR */}
            <div className="max-w-[1200px] mx-auto flex justify-end gap-4 mb-6 print-hidden">
              <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-2xl font-bold flex items-center gap-2 cursor-pointer border border-blue-400">
                🖨️ Imprimir / Guardar PDF
              </button>
              <button onClick={() => setShowExecutiveReport(false)} className="bg-white hover:bg-slate-50 text-slate-800 px-6 py-3 rounded-lg shadow-2xl font-bold flex items-center gap-2 cursor-pointer border border-slate-300">
                ✖ Cerrar Reporte
              </button>
            </div>

            {/* FOLIO A4 EXPANDIDO PARA APROVECHAR PANTALLA */}
            <div id="printable-a4-sheet" className="max-w-[1200px] mx-auto p-12 bg-white text-slate-900 shadow-2xl border border-slate-200 rounded-xl">
              <header className="border-b-2 border-slate-900 pb-6 mb-8">
                <div className="flex justify-between items-start gap-4 mb-4">
                  <div>
                    <h1 className="text-xl font-black uppercase text-slate-900">Universal Forwarding / B2B</h1>
                    <p className="text-xs font-semibold text-slate-600">División Especializada de Fletamentos y Carga de Proyecto</p>
                  </div>
                  <div className="text-right text-xs">
                    <p><strong className="text-slate-800">Fecha:</strong> {new Date().toLocaleDateString('es-ES')}</p>
                    <p><strong className="text-slate-800">Referencia:</strong> {activeProject?.project_ref}</p>
                    <p><strong className="text-slate-800">Cliente:</strong> {activeProject?.client_name}</p>
                  </div>
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 text-center">OFERTA COMERCIAL - PROJECT CARGO</h2>
              </header>

              {/* Resumen Operativo */}
              <section className="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-8">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2"><span>📊</span> Resumen Operativo</h3>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <span className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Volumen Total</span>
                    <span className="text-lg font-black text-slate-900 font-mono">{totals.m3.toFixed(2)} m³</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <span className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Peso Total</span>
                    <span className="text-lg font-black text-slate-900 font-mono">{totalWeightTons.toFixed(2)} Tons</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <span className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Modalidad</span>
                    <span className="text-lg font-black text-blue-700 font-mono">{shippingMode}</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <span className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Buque</span>
                    <span className="text-sm font-black text-slate-900 block mt-1">{vesselType}</span>
                  </div>
                </div>
              </section>

              {/* CROQUIS TÉCNICO DE ESTIBA NATIVO Y CLARO */}
              <section className="mb-8 print-exact">
                <div className="border border-slate-300 rounded-xl p-5 bg-white shadow-sm">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-4">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                        <span>🚢</span>
                        <span>Esquema Técnico de Estiba y Aseguramiento (Stowage & Lashing Plan)</span>
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Distribución geométrica en bodega y cubierta principal para buque tipo <strong className="text-slate-800">{vesselType}</strong>
                      </p>
                    </div>
                    <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded font-bold">
                      MODALIDAD: {shippingMode.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="bg-slate-50 p-3 rounded border border-slate-200">
                      <span className="text-blue-700 font-bold block mb-1">▶ ZONA 1: CUBIERTA PRINCIPAL / RODANTE (MAIN DECK / RO-RO)</span>
                      <p className="text-slate-600 text-[11px] leading-relaxed font-sans">
                        {shippingMode === 'Ro-Ro' 
                          ? 'Asignado para vehículos autopropulsados y plataformas MAFI. Trincaje bidireccional mediante cadenas de alta resistencia fijadas a los puntos D-Rings estructurales del buque con un factor de seguridad MBL > 1.5.' 
                          : 'Cubierta despejada para operaciones de izado directo mediante grúas de abordo (Geared Hook Operations).'}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3 rounded border border-slate-200">
                      <span className="text-emerald-700 font-bold block mb-1">▶ ZONA 2: BODEGA Y BLOQUES ESTÁTICOS (HEAVY LIFT / BREAKBULK)</span>
                      <p className="text-slate-600 text-[11px] leading-relaxed font-sans">
                        Estiba de bultos pesados sobre cunas y durmientes de madera certificada (*Dunnage*) para optimizar el reparto de cargas por metro cuadrado (t/m²) y evitar esfuerzos cortantes en la estructura del fondo de bodega.
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3 rounded border border-slate-200">
                      <span className="text-slate-800 font-bold block mb-1">▶ ZONA 3: PARAMETRIZACIÓN DE SEGURIDAD (MWS)</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px] text-slate-600 font-sans">
                        <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                          <span className="block text-[10px] uppercase">Maderas (Dunnage):</span>
                          <strong className="text-slate-900">{dunnageWood} lotes</strong>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                          <span className="block text-[10px] uppercase">Eslingas / Cadenas:</span>
                          <strong className="text-slate-900">{highCapacitySlings} / {chainsBinders} un</strong>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                          <span className="block text-[10px] uppercase">Cuadrillas Estiba:</span>
                          <strong className="text-slate-900">{stevedoreGangs} turnos</strong>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                          <span className="block text-[10px] uppercase">Plataformas MAFI:</span>
                          <strong className="text-slate-900">{mafiPlatforms} unidades</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Detalle Ponderado de Partidas */}
              <section className="mb-8">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2"><span>📋</span> Desglose de Partidas y Servicios del Proyecto</h3>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                      <th className="py-3 px-3 text-left">Concepto / Partida</th>
                      <th className="py-3 px-3 text-center">Piezas</th>
                      <th className="py-3 px-3 text-right">Coste Estimado (€)</th>
                      <th className="py-3 px-3 text-right">Precio Venta (€)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {cargoItems.map((item, idx) => {
                      const qty = Number(item.quantity) || 1;
                      const l = parseFloat(item.length) || 1;
                      const w = parseFloat(item.width) || 1;
                      const h = parseFloat(item.height) || 1;
                      const wt = parseFloat(item.weight) || 1000;
                      const itemMetric = qty * Math.max(wt, l * w * h * 100);
                      const ratio = itemMetric / totalMetricUnits;

                      const itemShareCost = finalTotalCost * ratio;
                      const itemShareSale = finalTotalSale * ratio;

                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-semibold text-slate-900">{item.type || 'Pieza de Proyecto'} ({l}x{w}x{h}m)</td>
                          <td className="py-3 px-3 text-center font-mono">{qty}</td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">{formatCurrency(itemShareCost)}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(itemShareSale)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              {/* Bloque Total de Venta */}
              <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl mb-8 flex justify-between items-center shadow-sm">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Importe Total Cotización</span>
                  <h2 className="text-xl font-black uppercase text-slate-900">PRECIO TOTAL DE VENTA</h2>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black font-mono text-blue-700">{formatCurrency(finalTotalSale)}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 font-semibold">Margen comercial incluido ({formatCurrency(finalTotalMargin)})</div>
                </div>
              </div>

              {/* Firmas */}
              <div className="grid grid-cols-2 gap-12 pt-16 text-center">
                <div>
                  <div className="border-b border-slate-400 pb-16 mb-2"></div>
                  <p className="text-xs font-bold text-slate-800">Por Universal Forwarding</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-16 mb-2"></div>
                  <p className="text-xs font-bold text-slate-800">Aceptación y Conformidad del Cliente</p>
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
