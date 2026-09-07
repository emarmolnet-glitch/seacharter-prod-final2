import React, { useState, useEffect, useRef } from 'react';
import { parsePackingList } from '../utils/packingListParser.js';
import AgenteProyectosWidget from './AgenteProyectosWidget';

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

export function ForwarderWorkspace() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [isAgentVisible, setIsAgentVisible] = useState(true);

  const [isCargoModalOpen, setIsCargoModalOpen] = useState(false);
  const [editingLineItemId, setEditingLineItemId] = useState(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null);

  const [showExecutiveReport, setShowExecutiveReport] = useState(false);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const fileInputRef = useRef(null);

  const [cargoItems, setCargoItems] = useState([]);
  const [projectDocuments, setprojectDocuments] = useState([]);

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
    setIsLoading(true); setError(null);
    try {
      const res = await fetch('/.netlify/functions/forwarder-projects', { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.projects || []);
      setProjects(list);
      if (activeProject) {
        const updated = list.find((p) => p.id === activeProject.id || p.project_ref === activeProject.project_ref);
        if (updated) {
          setActiveProject(updated);
          setprojectDocuments(updated.documents || updated.files || []);
        }
      }
    } catch (err) {
      console.error(err); setError(err?.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => {
    if (activeProject) {
      setprojectDocuments(activeProject.documents || activeProject.files || []);
    } else {
      setprojectDocuments([]);
    }
  }, [activeProject]);

  const persistProjectToDatabase = async (projectToSave) => {
    try {
      const res = await fetch('/.netlify/functions/forwarder-projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(projectToSave)
      });
      if (!res.ok) {
        await fetch('/.netlify/functions/forwarder-projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(projectToSave)
        });
      }
    } catch (err) {
      console.error('Error al guardar en base de datos:', err);
    }
  };

  const handleCreateProject = async () => {
    const input = window.prompt('Introduce el nombre del cliente para el nuevo proyecto:');
    if (!input || !input.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch('/.netlify/functions/forwarder-projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_name: input.trim(), documents: [] }),
      });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      const createdProject = payload.project || payload;
      setProjects((prev) => [createdProject, ...prev]);
      setActiveProject(createdProject);
      setprojectDocuments([]);
    } catch (err) {
      window.alert('No se pudo crear el proyecto.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleTriggerImport = () => { if (fileInputRef.current && !isAnalyzingFile) fileInputRef.current.click(); };

  const handleSaveDocumentToProject = async (docMeta) => {
    if (!activeProject) {
      window.alert('⚠️ Selecciona o crea un proyecto activo antes de adjuntar y guardar documentos.');
      return;
    }

    const newDoc = {
      id: docMeta.id || `doc-${Date.now()}-${Math.random()}`,
      name: docMeta.name || 'Documento_Proyecto.pdf',
      size: docMeta.size ? (typeof docMeta.size === 'string' ? docMeta.size : `${Math.round(docMeta.size / 1024)} KB`) : '120 KB',
      date: docMeta.uploadedAt ? new Date(docMeta.uploadedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      itemsCount: docMeta.itemsCount || 1,
      payload: docMeta
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

        const response = await fetch('/.netlify/functions/project-parser', {
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

        await handleSaveDocumentToProject({
          name: file.name,
          size: file.size,
          itemsCount: data.items ? data.items.length : 0,
          uploadedAt: new Date().toISOString(),
          dataBase64: dataBase64
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
      if (roRoRegex.test(rawType) || roRoRegex.test(rawType.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) { roRoItems += qty; } else { staticItems.push({ ...item, qty, quantity: qty, pieceWeight, weight: pieceWeight }); }
    });

    const autoMode = roRoItems > 0 ? 'Ro-Ro' : 'Lo-Lo';
    const recommendedVessel = roRoItems > 0 ? 'MPP / Pure Ro-Ro Carrier' : 'Geared Breakbulk (Lo-Lo)';
    setShippingMode(autoMode); setVesselType(recommendedVessel);

    const totalWeightTons = totalWeightKg / 1000;
    const Dunnage = Math.ceil(totalWeightTons / 5);
    const Cadenas = roRoItems * 4;
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

    setDunnage(Dunnage); setChains(Cadenas); setSlings(Eslingas); setShackles(Grilletes);
    setGangs(Gangs); setHeavyLift(HeavyLift); setMafiPlatforms(MAFIs);
    setLashingTeams(cargoItems.length > 0 ? Math.max(1, Math.ceil(totalPieces / 20) + (roRoItems > 0 ? 1 : 0)) : 0);

    let currentSurveyorCost = Number(surveyorCost) || 0;
    if (maxPieceWeight > 35000 && Number(surveyorCost) === 0 && !userEditedSurveyor.current) { currentSurveyorCost = 1500; setSurveyorCost(1500); }

    const RT = Math.max(totalWeightTons, totalVolumeM3);
    const freightCost = RT * 65;
    const lashingCost = (Dunnage * 30) + (Cadenas * 80) + (Eslingas * 40) + (Grilletes * 15);
    const stevedoringCost = (MAFIs * 300) + (HeavyLift * 2500) + (Gangs * 1200);
    const terminalStorageCost = Math.ceil(total_m2) * storageDays * 2;

    const totalEstimatedCost = freightCost + lashingCost + stevedoringCost + terminalStorageCost + currentSurveyorCost + (Number(inlandCost) || 0) + (Number(customsCost) || 0);
    setEstimatedCost(totalEstimatedCost.toFixed(2)); setSalePrice((totalEstimatedCost * 1.15).toFixed(2));
  };

  useEffect(() => { autoCalculateEstimates(cargoItems); }, [cargoItems, storageDays, surveyorCost, inlandCost, customsCost]);

  const handleApplyProjectPayload = async (payload) => {
    if (!payload) return;

    if (!activeProject) {
      window.alert('⚠️ Por favor, selecciona o crea un proyecto en la barra lateral antes de pedirle cambios al agente.');
      return;
    }

    let updatedProject = { ...activeProject };
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
      if (text.includes('aduana')) {
        const val = matchNumber(text);
        if (val !== null) { setCustomsCost(val); hasChanges = true; }
      }
    }

    if (payload.category !== undefined) {
      if (Array.isArray(payload.cargo_items) && payload.cargo_items.length > 0) {
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
      }
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
    if (payload.storageDays !== undefined) { setStorageDays(Number(payload.storageDays)); hasChanges = true; }
    if (payload.surveyorCost !== undefined) {
      userEditedSurveyor.current = true;
      setSurveyorCost(Number(payload.surveyorCost));
      hasChanges = true;
    }
    if (payload.inlandTrucksCount !== undefined) { setInlandCost(payload.inlandTrucksCount); hasChanges = true; }
    if (payload.customsCost !== undefined) { setCustomsCost(payload.customsCost); hasChanges = true; }

    if (structuralModified || payload.forceOpenModal) {
      setIsCargoModalOpen(true);
    }

    if (hasChanges) {
      setActiveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      await persistProjectToDatabase(updatedProject);
    }
  };

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
          id: ci.id || `item-${Date.now()}`, category: ci.category || 'Equipos de Proceso', quantity: ci.quantity || 1, type: ci.type || '',
          length: ci.length_m ?? '', width: ci.width_m ?? '', height: ci.height_m ?? '', weight: ci.unit_weight_kg ?? '', shipping_mode_supported: ci.shipping_mode_supported || "40' HC Contenedor"
        })));
      }
      const mats = payload.lashing_and_dunnage_materials || {};
      setDunnageWood(mats.dunnage_wood || 0); setHighCapacitySlings(mats.high_capacity_slings || 0); setChainsBinders(mats.chains_and_binders || 0); setShackles(mats.shackles || 0);
      const labor = payload.port_labor_and_equipment || {};
      setStevedoreGangs(labor.stevedore_gangs_shifts || 0); setLashingTeam(labor.lashing_team || 0); setHeavyLiftCrane(labor.heavy_lift_crane || 0); setMafiPlatforms(labor.mafi_platforms || 0);
      if (payload.shipping_mode) setShippingMode(payload.shipping_mode);
      if (payload.recommended_vessel) setVesselType(payload.recommended_vessel);
      const peri = payload.peripheral_services || {};
      setStorageDays(peri.storage_days || 0); setSurveyorCost(peri.surveyor_cost || 0); setInlandCost(peri.inland_cost || 0); setCustomsCost(peri.customs_cost || 0);
      userEditedSurveyor.current = (peri.surveyor_cost || peri.surveyorCost) != null;
      const fin = payload.financial_summary || {};
      setEstimatedCost(fin.estimated_total_cost_eur ? String(fin.estimated_total_cost_eur) : ''); setSalePrice(fin.customer_sale_price_eur ? String(fin.customer_sale_price_eur) : '');
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
    const payload = {
      project_ref: activeProject?.project_ref,
      cargo_items: cargoItems.map((item) => ({
        category: item.category || 'Equipos de Proceso', quantity: parseInt(item.quantity, 10) || 1, type: item.type || 'Sin especificar',
        length_m: parseFloat(item.length) || 0, width_m: parseFloat(item.width) || 0, height_m: parseFloat(item.height) || 0, unit_weight_kg: parseFloat(item.weight) || 0, shipping_mode_supported: item.shipping_mode_supported || "40' HC Contenedor"
      })),
      financial_summary: { estimated_total_cost_eur: parseFloat(estimatedCost) || 0, customer_sale_price_eur: parseFloat(salePrice) || 0 }
    };
    const lineItemCost = parseFloat(estimatedCost) || 0;
    const lineItemPrice = parseFloat(salePrice) || 0;
    const savedLineItem = {
      id: editingLineItemId || `item-${Date.now()}`,
      description: `Flete y Estiba Project Cargo (${totals.quantity} piezas, ${totals.weight.toLocaleString('es-ES')} kg)`,
      cost_eur: lineItemCost, sale_price_eur: lineItemPrice, margin_eur: lineItemPrice - lineItemCost, payload_data: payload,
    };
    if (activeProject) {
      const existingItems = activeProject.line_items || [];
      const updatedLineItems = editingLineItemId ? existingItems.map((li) => (li.id === editingLineItemId ? savedLineItem : li)) : [...existingItems, savedLineItem];
      const updatedProject = { ...activeProject, line_items: updatedLineItems, services: updatedLineItems };
      setActiveProject(updatedProject);
      setProjects((prev) => prev.map((p) => p.id === activeProject.id ? updatedProject : p));
      await persistProjectToDatabase(updatedProject);
    }
    setIsCargoModalOpen(false);
    setSaveSuccessMessage('¡Flete y estiba guardados correctamente!');
    setTimeout(() => setSaveSuccessMessage(null), 3500);
  };

  const getStowageAscii = () => {
    if (shippingMode === 'Ro-Ro') {
      return `+========================================================================================+
| [PROA / BOW]         PERFIL OPERATIVO CUBIERTA RODANTE RO-RO             [POPA/STERN] |
|                                                                   [RAMPA POPA 75T SWL]|
|----------------------------------------------------------------------------------------|
|  CUBIERTA SUPERIOR / WEATHER DECK (VEHÍCULOS Y CARGA RODANTE INTEMPERIE)               |
|  [ Acceso por rampa fija | Trincaje con cinchas de poliéster 5T | SWL: 2.50 t/m² ]     |
|----------------------------------------------------------------------------------------|
|  CUBIERTA PRINCIPAL / MAIN GARAGE DECK (GÁLIBO LIBRE VERTICAL: 5.20 METROS)             |
|   +-------------------+  +-------------------+  +-------------------+                  |
|   | CARRIL 1 (BABOR): |  | CARRIL 2 (CRUJÍA):|  | CARRIL 3 (ESTRIBOR):|                  |
|   | Plataformas MAFI  |  | Cabezas tractoras |  | Carga estática    |                  |
|   | con piezas pesadas|  | y remolques       |  | sobre Roll-Trailers |                  |
|   +-------------------+  +-------------------+  +-------------------+                  |
|   Trincaje D-Rings estructurales cada 2.5m | Cadenas de tracción bidireccional MBL>1.5 |
|----------------------------------------------------------------------------------------|
|  CUBIERTA INFERIOR / LOWER HOLD (ACCESO MEDIANTE RAMPA INTERNA ELEVABLE)               |
|  [ Vehículos ligeros / Maquinaria rodante compacta | Calzos de seguridad y cinchas    ] |
+========================================================================================+`;
    }
    return `+========================================================================================+
| [PROA / BOW]          SECCIÓN LONGITUDINAL Y BODEGA PROYECTO            [POPA/STERN] |
|                                                                                        |
|              GRÚA 1 [SWL 60t]                           GRÚA 2 [SWL 60t]               |
|                /                                          /                            |
|              ___/                                       ___/                           |
|========================================================================================|
| CUBIERTA PRINCIPAL / WEATHER DECK (DESPEJADA / OPERACIÓN EN TÁNDEM HASTA 120t SWL)      |
| [ Piezas sobre cubierta izadas por gancho directo | Capacidad admisible: 3.50 t/m² ]   |
|----------------------------------------------------------------------------------------|
| ENTREPUENTE / TWEEN DECK (PONTÓN DESMONTABLE PARA REGULACIÓN DE ALTURA LIBRE)          |
|  [ CAJA MAQUINARIA - 4.2x2.4m]       [ SKID INDUSTRIAL]       [ CAJA GENERADOR AUXILIAR] |
|  Trincaje: Cables de acero 16mm + Tensores MBL > 1.5 | Apoyo sobre maderas dunnage      |
|----------------------------------------------------------------------------------------|
| FONDO DE BODEGA / TANKTOP (MÁXIMA CAPACIDAD PORTANTE ESTRUCTURAL: 15.0 - 20.0 t/m²)      |
|    +-------------------------+      +--------------------------+                       |
|    | ⚡ TRANSFORMADOR ELÉCTRICO |      | ⚙️ EJE PROPULSOR INDUSTRIAL |                       |
|    | (Sobre cunas y durmientes)|      | (Fijación base reforzada)|                       |
|    +-------------------------+      +--------------------------+                       |
|    Reparto de presiones con durmientes certificados (*Dunnage*) y cadenas cruzadas G80  |
+========================================================================================+`;
  };

  return (
    <>
      <div className={`w-full h-full flex overflow-hidden bg-slate-900 text-slate-100 font-sans relative ${showExecutiveReport ? 'print:hidden' : ''}`}>
        <aside className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden print:hidden">
          <div className="p-4 border-b border-slate-800">
            <button onClick={handleCreateProject} disabled={isCreating} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase rounded-lg shadow-md cursor-pointer">{isCreating ? 'Creando...' : '+ Nuevo Proyecto'}</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {projects.map((proj) => {
              const isSelected = activeProject && activeProject.id === proj.id;
              return (
                <div key={proj.id} onClick={() => setActiveProject(proj)} className={`p-3.5 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-slate-800 border-blue-500' : 'bg-slate-900/60 border-slate-800'}`}>
                  <span className="font-mono text-[11px] text-sky-400">{proj.project_ref}</span>
                  <h3 className="font-bold text-slate-200 text-sm truncate">{proj.client_name}</h3>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 bg-slate-50 flex flex-col h-full overflow-y-auto print:hidden">
          {!activeProject ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600"><h3 className="text-xl font-black text-slate-800">Expediente de Transitario</h3><p className="mt-2 text-xs">Selecciona un proyecto de la lista lateral para comenzar.</p></div>
          ) : (
            <div className="flex-1 flex flex-col p-6 space-y-6">
              <header className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveProject(null)}
                  className="bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 hover:border-slate-400 px-4 py-2 rounded-lg font-bold text-xs shadow-sm cursor-pointer transition flex items-center gap-2 shrink-0"
                >
                  ← Volver a Proyectos
                </button>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sky-700 bg-sky-100 px-2.5 py-1 rounded border border-sky-300">
                    # REF: {activeProject.project_ref || 'RDM/2026-001'}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300 uppercase">
                    {activeProject.status || 'Borrador'}
                  </span>
                </div>
                <h1 className="text-3xl font-bold text-slate-900">{activeProject.client_name}</h1>
              </header>

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

              {activeProject.line_items?.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center"><h3 className="text-base font-bold text-slate-900">Servicios</h3><button onClick={handleOpenCreateService} className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer">➕ Añadir Servicio</button></div>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 font-bold border-b border-slate-200 text-slate-700"><tr><th className="px-4 py-3 text-left">Servicio</th><th className="px-4 py-3 text-right">Coste (€)</th><th className="px-4 py-3 text-right">Venta (€)</th><th className="px-4 py-3 text-center">Acciones</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {activeProject.line_items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-100"><td className="px-4 py-3 font-semibold">{item.description}</td><td className="px-4 py-3 text-right text-rose-600 font-bold">{Number(item.cost_eur).toLocaleString('es-ES')} €</td><td className="px-4 py-3 text-right text-emerald-600 font-bold">{Number(item.sale_price_eur).toLocaleString('es-ES')} €</td><td className="px-4 py-3 text-center"><button onClick={() => handleEditService(item)} className="mx-1 cursor-pointer">✏️</button><button onClick={() => handleDeleteService(item.id)} className="mx-1 cursor-pointer">🗑️</button></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 flex flex-col items-center bg-white text-center">
                  <p className="text-slate-600 font-bold mb-3">No hay servicios logísticos añadidos a este proyecto</p>
                  <button onClick={handleOpenCreateService} className="px-5 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-sm hover:bg-blue-700 transition cursor-pointer">➕ Añadir Servicio</button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* MODAL PRINCIPAL TEMA CLARO PANTALLA COMPLETA */}
        {isCargoModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto print:hidden">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full h-[95vh] flex flex-col overflow-hidden text-slate-900">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Project Cargo Builder</h2>
                <button onClick={() => setIsCargoModalOpen(false)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center justify-center font-bold">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 divide-y divide-slate-100">
                <section className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">1. Lista de Empaque</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCargoModalOpen(false);
                          setActiveProject(null);
                        }}
                        className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-colors mr-2 cursor-pointer"
                      >
                        ← Volver a Proyectos
                      </button>
                      <input ref={fileInputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                      <button onClick={handleTriggerImport} className="px-4 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg cursor-pointer shadow-sm">🤖 Importar PDF/Excel</button>
                      <button onClick={handleAddCargoPiece} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-sm">➕ Añadir Pieza</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <table className="w-full table-fixed text-left text-[11px] text-slate-700">
                      <thead className="bg-slate-100 font-bold text-slate-600 border-b border-slate-200 uppercase tracking-wider">
                        <tr>
                          <th className="px-2 py-3 w-[15%]">Categoría</th>
                          <th className="px-2 py-3 w-[35%]">Descripción</th>
                          <th className="px-2 py-3 w-[6%] text-center">Cant.</th>
                          <th className="px-2 py-3 w-[17%] text-center">Dimensiones (m)</th>
                          <th className="px-2 py-3 w-[9%] text-right">Peso U. (kg)</th>
                          <th className="px-2 py-3 w-[14%]">Modo Envío</th>
                          <th className="px-2 py-3 w-[4%] text-center">🗑️</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cargoItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80">
                            <td className="p-1"><input type="text" value={item.category || ''} onChange={(e) => handleUpdateCargoItem(item.id, 'category', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-2 py-1.5 text-slate-800" placeholder="Ej: Equipos..." /></td>
                            <td className="p-1"><input type="text" value={item.type || ''} onChange={(e) => handleUpdateCargoItem(item.id, 'type', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-2 py-1.5 text-slate-900 font-semibold" placeholder="Descripción de pieza..." /></td>
                            <td className="p-1"><input type="number" min={1} value={item.quantity} onChange={(e) => handleUpdateCargoItem(item.id, 'quantity', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-1 py-1.5 text-center text-slate-900" /></td>
                            <td className="p-1">
                              <div className="flex items-center gap-1 w-full">
                                <input type="number" placeholder="L" value={item.length} onChange={(e) => handleUpdateCargoItem(item.id, 'length', e.target.value)} className="w-1/3 min-w-0 bg-white border border-slate-300 px-1 py-1.5 rounded text-center" />x
                                <input type="number" placeholder="W" value={item.width} onChange={(e) => handleUpdateCargoItem(item.id, 'width', e.target.value)} className="w-1/3 min-w-0 bg-white border border-slate-300 px-1 py-1.5 rounded text-center" />x
                                <input type="number" placeholder="H" value={item.height} onChange={(e) => handleUpdateCargoItem(item.id, 'height', e.target.value)} className="w-1/3 min-w-0 bg-white border border-slate-300 px-1 py-1.5 rounded text-center" />
                              </div>
                            </td>
                            <td className="p-1"><input type="number" value={item.weight} onChange={(e) => handleUpdateCargoItem(item.id, 'weight', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-2 py-1.5 text-right font-mono" /></td>
                            <td className="p-1"><input type="text" value={item.shipping_mode_supported || ''} onChange={(e) => handleUpdateCargoItem(item.id, 'shipping_mode_supported', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-2 py-1.5 text-slate-600 text-[10px]" placeholder="Modo..." /></td>
                            <td className="p-1 text-center"><button onClick={() => handleRemoveCargoItem(item.id)} className="text-rose-500 hover:text-rose-700 bg-rose-50 rounded p-1 font-bold w-full h-full cursor-pointer">✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">2. Trincaje y Operativa</h3>
                  <div id="logistic-engine-banner" role="status" aria-live="polite" className="bg-slate-900 border-l-4 border-cyan-500 p-4 rounded shadow-lg flex items-center gap-4 mb-6">
                    <div className="text-2xl">⚙️</div>
                    <div className="flex flex-col">
                      <span className="text-cyan-400 font-bold text-sm tracking-wide uppercase">Motor de Decisión Operativa IA</span>
                      <span className="text-slate-200 mt-1 text-[11px]">
                        Modalidad detectada: <strong className="text-white ml-1 mr-3">{shippingMode}</strong>
                        Buque recomendado: <strong className="text-white ml-1">{vesselType}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <NumericCounter label="Maderas" subtitle="Dunnage" value={dunnageWood} onChange={setDunnageWood} />
                    <NumericCounter label="Eslingas" subtitle="Alta Capacidad" value={highCapacitySlings} onChange={setHighCapacitySlings} />
                    <NumericCounter label="Cadenas" subtitle="Trincaje Pesado" value={chainsBinders} onChange={setChainsBinders} />
                  </div>
                </section>

                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">3. Mano de Obra Portuaria</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <NumericCounter label="Turnos Estiba" subtitle="Cuadrillas completas" value={stevedoreGangs} onChange={setStevedoreGangs} />
                    <NumericCounter label="Eq. Trincadores" subtitle="Especialistas" value={lashingTeam} onChange={setLashingTeam} />
                    <NumericCounter label="Grúas Heavy Lift" subtitle="Móvil Portuaria" value={heavyLiftCrane} onChange={setHeavyLiftCrane} />
                    <NumericCounter label="Plataformas MAFI" subtitle="Roll Trailers" value={mafiPlatforms} onChange={setMafiPlatforms} />
                  </div>
                </section>

                <section className="pt-6 space-y-4">
                  <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">4. Logística Periférica</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Días Almacenaje</label><input type="number" value={storageDays} onChange={(e) => setStorageDays(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Surveyor (€)</label><input type="number" value={surveyorCost} onChange={(e) => { userEditedSurveyor.current=true; setSurveyorCost(e.target.value); }} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Transporte Inland (€)</label><input type="number" value={inlandCost} onChange={(e) => setInlandCost(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Aduanas (€)</label><input type="number" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                  </div>
                </section>
              </div>

              <div className="bg-slate-50 p-6 border-t border-slate-200 flex justify-between items-end shrink-0">
                <div className="flex gap-6 w-1/2">
                  <div className="w-full relative">
                    <label htmlFor="input-estimated-cost" className="block text-slate-500 font-bold text-[10px] uppercase mb-1">COSTE TOTAL ESTIMADO (€)</label>
                    <input id="input-estimated-cost" type="number" readOnly value={estimatedCost} className="w-full bg-slate-800 text-white font-bold text-2xl text-right p-3 pr-14 rounded border border-slate-600 outline-none focus:border-cyan-500 shadow-inner" />
                    <span className="absolute right-3.5 bottom-3 text-xs text-slate-400 font-mono font-semibold">EUR</span>
                  </div>
                  <div className="w-full relative">
                    <label htmlFor="input-sale-price" className="block text-blue-600 font-bold text-[10px] uppercase mb-1">PRECIO VENTA CLIENTE (€)</label>
                    <input id="input-sale-price" type="number" readOnly value={salePrice} className="w-full bg-slate-800 text-white font-bold text-2xl text-right p-3 pr-14 rounded border border-slate-600 outline-none focus:border-cyan-500 shadow-inner" />
                    <span className="absolute right-3.5 bottom-3 text-xs text-slate-400 font-mono font-semibold">EUR</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowExecutiveReport(true)} className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded shadow font-bold text-sm cursor-pointer">📄 Generar Reporte</button>
                  <button onClick={handleSaveProjectCargo} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded shadow font-bold text-sm cursor-pointer">💾 GUARDAR PROYECTO</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showExecutiveReport && (() => {
        const totalWeightTons = (totals.weight || 0) / 1000;
        const totalVolumeM3 = totals.m3 || 0;
        const reportRT = Math.max(totalWeightTons, totalVolumeM3);
        const finalTotalCost = parseFloat(estimatedCost) || 0;
        const finalTotalSale = parseFloat(salePrice) || 0;
        const finalTotalMargin = finalTotalSale - finalTotalCost;
        const formatCurrency = (val) => Number(val || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

        const totalMetricUnits = cargoItems.reduce((sum, item) => sum + ((Number(item.quantity) || 1) * (parseFloat(item.weight) || 1000)), 0) || 1;
        const unitRateSale = reportRT > 0 ? finalTotalSale / reportRT : 0;

        return (
          <div className="fixed inset-0 bg-slate-200 z-[999999] overflow-y-auto pt-28 pb-10 px-4 sm:px-10 text-slate-900 print:bg-white print:p-0">
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                #printable-a4-sheet, #printable-a4-sheet * { visibility: visible !important; }
                #printable-a4-sheet { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 15mm !important; border: none !important; box-shadow: none !important;}
                .print-hidden { display: none !important; }
                @page { size: A4 portrait; margin: 0; }
              }
            `}</style>

            <div className="fixed bottom-8 right-8 flex flex-col sm:flex-row gap-4 z-[9999999] print-hidden">
              <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full shadow-2xl font-black flex items-center gap-2 border-2 border-white cursor-pointer hover:scale-105 transition-transform">
                🖨️ IMPRIMIR / PDF
              </button>
              <button onClick={() => setShowExecutiveReport(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl font-black flex items-center gap-2 border-2 border-white cursor-pointer hover:scale-105 transition-transform">
                ✖ CERRAR REPORTE
              </button>
            </div>

            <div id="printable-a4-sheet" className="max-w-[1100px] mx-auto p-12 bg-white text-slate-900 shadow-xl border border-slate-300 rounded">
              
              <header className="border-b-2 border-slate-200 pb-4 mb-6 flex justify-between items-end">
                <div>
                  <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
                    UNIVERSAL FORWARDING / B2B
                  </h1>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    División Especializada de Fletamentos y Carga de Proyecto
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-600 font-mono">
                  <div className="mb-1"><span className="font-bold text-slate-800 uppercase text-[10px] mr-2">Fecha:</span>{new Date().toLocaleDateString('es-ES')}</div>
                  <div className="mb-1"><span className="font-bold text-slate-800 uppercase text-[10px] mr-2">Ref:</span>{activeProject?.project_ref || 'EXP-SIN-REF'}</div>
                  <div><span className="font-bold text-slate-800 uppercase text-[10px] mr-2">Cliente:</span><span className="font-bold text-blue-700">{activeProject?.client_name || 'Sin Cliente'}</span></div>
                </div>
              </header>

              <section className="bg-slate-50 p-6 rounded-lg border border-slate-200 mb-8">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="bg-white p-3 rounded border border-slate-200"><span className="block text-[10px] uppercase font-bold text-slate-500">Volumen Total</span><span className="text-xl font-black text-slate-900">{totals.m3.toFixed(2)} m³</span></div>
                  <div className="bg-white p-3 rounded border border-slate-200"><span className="block text-[10px] uppercase font-bold text-slate-500">Peso Total</span><span className="text-xl font-black text-slate-900">{totalWeightTons.toFixed(2)} Tons</span></div>
                  <div className="bg-white p-3 rounded border border-slate-200"><span className="block text-[10px] uppercase font-bold text-slate-500">Modalidad</span><span className="text-xl font-black text-blue-600">{shippingMode}</span></div>
                  <div className="bg-white p-3 rounded border border-slate-200"><span className="block text-[10px] uppercase font-bold text-slate-500">Buque Sugerido</span><span className="text-sm font-black text-slate-900 mt-1 block">{vesselType}</span></div>
                </div>
              </section>

              <section className="mb-8 print-exact">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-3 border-b-2 border-slate-200 pb-2">🚢 Croquis Esquemático de Estiba (Stowage Plan)</h3>
                <div className="bg-slate-50 border border-slate-300 p-4 rounded overflow-x-auto text-[10px] leading-tight font-mono whitespace-pre text-slate-800">
                  {getStowageAscii()}
                </div>
              </section>

              <section className="mb-8">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-3 border-b-2 border-slate-200 pb-2">📋 Desglose de Partidas y Servicios del Proyecto</h3>
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 uppercase font-bold border-y-2 border-slate-300">
                      <th className="py-3 px-2 text-left">Concepto / Partida</th>
                      <th className="py-3 px-2 text-center">Piezas</th>
                      <th className="py-3 px-2 text-right">Coste Est.</th>
                      <th className="py-3 px-2 text-right">Precio Venta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {cargoItems.map((item, idx) => {
                      const ratio = ((Number(item.quantity)||1) * (parseFloat(item.weight)||1000)) / totalMetricUnits;
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-3 px-2 font-bold text-slate-900">{item.type || 'Pieza'} <span className="text-slate-500 font-normal">({item.length}x{item.width}x{item.height}m)</span></td>
                          <td className="py-3 px-2 text-center font-mono">{item.quantity}</td>
                          <td className="py-3 px-2 text-right font-mono text-slate-600">{formatCurrency(finalTotalCost * ratio)}</td>
                          <td className="py-3 px-2 text-right font-mono font-bold text-slate-900">{formatCurrency(finalTotalSale * ratio)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              <div className="bg-slate-100 border-2 border-slate-900 p-6 rounded-lg flex justify-between items-center mb-8">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-600 tracking-widest block mb-1">Importe Total Cotización (All-In)</span>
                  <h2 className="text-2xl font-black uppercase text-slate-900">PRECIO TOTAL DE VENTA</h2>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1 rounded text-xs font-bold font-mono">
                      Tarifa: {formatCurrency(unitRateSale)} / RT (W/M)
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">Cálculo sobre {reportRT.toFixed(2)} Revenue Tons</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black font-mono text-blue-700">{formatCurrency(finalTotalSale)}</div>
                  <div className="text-xs text-slate-500 mt-1 font-bold">Margen comercial ({formatCurrency(finalTotalMargin)})</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-16 pt-12 text-center">
                <div><div className="border-b border-slate-400 pb-16 mb-2"></div><p className="text-xs font-bold text-slate-800">Firma Transitario</p></div>
                <div><div className="border-b border-slate-400 pb-16 mb-2"></div><p className="text-xs font-bold text-slate-800">Aceptación Cliente</p></div>
              </div>
            </div>
          </div>
        );
      })()}

      <AgenteProyectosWidget
        onUpdatePayload={handleApplyProjectPayload}
        isOpen={isAgentVisible}
        onToggleOpen={setIsAgentVisible}
      />
    </>
  );
}

export default ForwarderWorkspace;
