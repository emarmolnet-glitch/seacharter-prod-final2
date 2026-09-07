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
  const [reportData, setReportData] = useState(null);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowExecutiveReport(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
  const [spreaderMultipunto, setSpreaderMultipunto] = useState(0);
  const [craneLiftCycles, setCraneLiftCycles] = useState(0);

  const [shippingMode, setShippingMode] = useState('Lo-Lo');
  const [vesselType, setVesselType] = useState('Geared Breakbulk (Lo-Lo)');

  const [isUnder40t, setIsUnder40t] = useState(false);
  const [tceActive, setTceActive] = useState(false);
  const [tceValue, setTceValue] = useState(null);
  const [charterMode, setCharterMode] = useState('Fletamento Completo');
  const [isBigBagsCargo, setIsBigBagsCargo] = useState(false);
  const [operationalProfileNotice, setOperationalProfileNotice] = useState('');

  const [storageDays, setStorageDays] = useState(0);
  const [surveyorCost, setSurveyorCost] = useState(0);
  const [inlandCost, setInlandCost] = useState(0);
  const [customsCost, setCustomsCost] = useState(0);
  const userEditedSurveyor = useRef(false);

  // Parámetros dinámicos de ruta, ritmos operativos, rotación y demoras
  const [pol, setPol] = useState('Valencia');
  const [pod, setPod] = useState('Houston');
  const [loadingRate, setLoadingRate] = useState(1200);
  const [dischargingRate, setDischargingRate] = useState(1000);
  const [distanceNm, setDistanceNm] = useState(4850);
  const [vesselSpeedKnots, setVesselSpeedKnots] = useState(12.0);
  const [vesselDailyHireUsd, setVesselDailyHireUsd] = useState(11500);
  const [exchangeRateUsdEur, setExchangeRateUsdEur] = useState(0.92);
  const [actualLoadingDays, setActualLoadingDays] = useState('');
  const [actualDischargingDays, setActualDischargingDays] = useState('');
  const [demurrageDailyRateUsd, setDemurrageDailyRateUsd] = useState(11500);

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
      setSubtotalFreight('0.00'); setSubtotalFobOperations('0.00');
      setEstimatedCost(''); setSalePrice('');
      setIsUnder40t(false); setTceActive(false); setTceValue(null);
      setOperationalProfileNotice('');
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

    let effectiveDunnage = Dunnage;
    let effectiveCadenas = Cadenas;
    let effectiveSlings = Eslingas;
    let effectiveHeavyLift = HeavyLift;

    if (isBigBagsOrBulk) {
      // Regla estricta Big Bags: Queda prohibido calcular eslingas sueltas individuales o materiales de trincaje pesado (cadenas, maderas de cuna estructurales)
      effectiveDunnage = 0;
      effectiveCadenas = 0;
      effectiveHeavyLift = 0;
      effectiveSlings = 0;

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
    } else {
      setSpreaderMultipunto(0);
      setCraneLiftCycles(0);
      setOperationalProfileNotice('Perfil: Carga Industrial de Proyecto / Breakbulk · Cunas estructurales y cables/cadenas requeridos');
    }

    let currentSurveyorCost = Number(surveyorCost) || 0;
    if (maxPieceWeight > 35000 && Number(surveyorCost) === 0 && !userEditedSurveyor.current) { currentSurveyorCost = 1500; setSurveyorCost(1500); }

    // 2. Evaluación del umbral de 40 toneladas
    const isUnderThreshold = totalWeightTons < 40;
    setIsUnder40t(isUnderThreshold);

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

      // Subtotal 2: Costes FOB y Operativa Portuaria (CFS, Tasas T3, B/L, almacenaje, surveyor, inland, aduanas)
      const cfsOriginCost = revenueTons * 22.0;
      const cfsDestCost = revenueTons * 25.0;
      const portT3Cost = revenueTons * 4.5;
      const blFee = 85.0;
      const totalLclFreightCost = oceanFreightCost + cfsOriginCost + cfsDestCost + portT3Cost + blFee;
      const terminalStorageCost = Math.ceil(total_m2) * storageDays * 2;

      calculatedOceanFreight = oceanFreightCost;
      calculatedFobOperations = cfsOriginCost + cfsDestCost + portT3Cost + blFee + terminalStorageCost + currentSurveyorCost + (Number(inlandCost) || 0) + (Number(customsCost) || 0);

      totalEstimatedCost = calculatedOceanFreight + calculatedFobOperations;
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
      // Días de Carga = Peso Total de la Carga (MT) / Ritmo de Carga (MT/día)
      // Días de Descarga = Peso Total de la Carga (MT) / Ritmo de Descarga (MT/día)
      // Días de Navegación = Distancia Náutica POL-POD / (Velocidad de Servicio del Buque en nudos × 24)
      // Flete Marítimo (TCE) = D_total × Tarifa diaria (USD/día) × Tipo de cambio aplicable
      const effectiveLoadRate = Math.max(1, Number(loadingRate) || (isBigBagsOrBulk ? 1200 : 850));
      const effectiveDischRate = Math.max(1, Number(dischargingRate) || (isBigBagsOrBulk ? 1000 : 750));
      const diasCarga = totalWeightTons > 0 ? Math.round((totalWeightTons / effectiveLoadRate) * 100) / 100 : 0;
      const diasDescarga = totalWeightTons > 0 ? Math.round((totalWeightTons / effectiveDischRate) * 100) / 100 : 0;

      const effectiveDistance = Math.max(10, Number(distanceNm) || 1500);
      const defaultSpeed = totalWeightTons >= 35000 ? 13.5 : (totalWeightTons >= 10000 ? 13.0 : (totalWeightTons >= 3000 ? 12.0 : 10.5));
      const effectiveSpeed = Math.max(1, Number(vesselSpeedKnots) || defaultSpeed);
      const diasNavegacion = Math.round((effectiveDistance / (effectiveSpeed * 24)) * 100) / 100;
      const diasRotacionTotal = Math.round((diasCarga + diasDescarga + diasNavegacion) * 100) / 100;

      const effectiveDailyHire = Number(vesselDailyHireUsd) || dailyTce;
      const effectiveExRate = Number(exchangeRateUsdEur) || 0.92;

      // Subtotal 1: Flete Marítimo Buque Completo / TCE
      const freightCost = Math.round(diasRotacionTotal * effectiveDailyHire * effectiveExRate * 100) / 100;

      // CÁLCULO Y GESTIÓN DE DEMORAS (Demurrage)
      const actualLoad = actualLoadingDays !== '' && actualLoadingDays !== null && !isNaN(Number(actualLoadingDays)) ? Number(actualLoadingDays) : null;
      const actualDisch = actualDischargingDays !== '' && actualDischargingDays !== null && !isNaN(Number(actualDischargingDays)) ? Number(actualDischargingDays) : null;
      const demLoadDays = (actualLoad !== null && actualLoad > diasCarga) ? Math.round((actualLoad - diasCarga) * 100) / 100 : 0;
      const demDischDays = (actualDisch !== null && actualDisch > diasDescarga) ? Math.round((actualDisch - diasDescarga) * 100) / 100 : 0;
      const totalDemDays = Math.round((demLoadDays + demDischDays) * 100) / 100;
      const effectiveDemDaily = Number(demurrageDailyRateUsd) || effectiveDailyHire;
      const demurrageCostEur = Math.round(totalDemDays * effectiveDemDaily * effectiveExRate * 100) / 100;

      // Subtotal 2: Costes FOB y Operativa Portuaria (trincaje, estiba, grúas/MAFIs, terminal, peritaje, inland, aduanas, demoras)
      const spreaderCost = isBigBagsOrBulk ? ((spreaderMultipunto || Math.max(1, Math.min(2, Math.ceil(totalPieces / 1500)))) * 600) : 0;
      const airBagsCost = isBigBagsOrBulk ? (Math.max(2, Math.ceil(totalWeightTons / 50)) * 35) : 0;

      const lashingCost = isBigBagsOrBulk
        ? (spreaderCost + airBagsCost)
        : ((effectiveDunnage * 30) + (effectiveCadenas * 80) + (effectiveSlings * 40) + ((effectiveSlings * 2 + effectiveCadenas * 2) * 15));
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

      calculatedOceanFreight = freightCost;
      calculatedFobOperations = lashingCost + stevedoringCost + portCraneCost + terminalStorageCost + initialHandlingCost + currentSurveyorCost + (Number(inlandCost) || 0) + (Number(customsCost) || 0) + demurrageCostEur;

      totalEstimatedCost = calculatedOceanFreight + calculatedFobOperations;
    }

    setSubtotalFreight(calculatedOceanFreight.toFixed(2));
    setSubtotalFobOperations(calculatedFobOperations.toFixed(2));
    setEstimatedCost(totalEstimatedCost.toFixed(2));
    setSalePrice((totalEstimatedCost * 1.15).toFixed(2));
  };

  useEffect(() => {
    autoCalculateEstimates(cargoItems);
  }, [
    cargoItems,
    storageDays,
    surveyorCost,
    inlandCost,
    customsCost,
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
  ]);

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
      if (text.includes('aduana')) {
        const val = matchNumber(text);
        if (val !== null) { setCustomsCost(val); hasChanges = true; }
      }
    }

    // Parámetros de ruta y ritmos operativos
    if (payload.pol) { setPol(payload.pol); hasChanges = true; }
    if (payload.pod) { setPod(payload.pod); hasChanges = true; }
    if (payload.loadingRate || payload.loadingRateMtDay) {
      setLoadingRate(Number(payload.loadingRate || payload.loadingRateMtDay));
      hasChanges = true;
    }
    if (payload.dischargingRate || payload.dischargingRateMtDay) {
      setDischargingRate(Number(payload.dischargingRate || payload.dischargingRateMtDay));
      hasChanges = true;
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
    if (payload.requestFinancialBreakdown) {
      setIsCargoModalOpen(true);
    }

    if (hasChanges) {
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
    const reportPol = sourcePayload?.route_and_chartering?.pol || pol || 'Valencia';
    const reportPod = sourcePayload?.route_and_chartering?.pod || pod || 'Houston';
    const reportLoadRate = Math.max(1, Number(sourcePayload?.route_and_chartering?.loading_rate_mt_day ?? loadingRate) || (isBigBags ? 1200 : 850));
    const reportDischRate = Math.max(1, Number(sourcePayload?.route_and_chartering?.discharging_rate_mt_day ?? dischargingRate) || (isBigBags ? 1000 : 750));
    const reportDistance = Math.max(10, Number(sourcePayload?.route_and_chartering?.distance_nm ?? distanceNm) || 1500);
    const reportSpeed = Math.max(1, Number(sourcePayload?.route_and_chartering?.vessel_speed_knots ?? vesselSpeedKnots) || 12.0);
    const reportDailyHire = Number(sourcePayload?.route_and_chartering?.daily_hire_rate_usd ?? vesselDailyHireUsd) || (totalWeightTons >= 35000 ? 16500 : (totalWeightTons >= 10000 ? 13800 : (totalWeightTons >= 3000 ? 11500 : 8500)));
    const reportExRate = Number(sourcePayload?.route_and_chartering?.exchange_rate ?? exchangeRateUsdEur) || 0.92;

    const diasCarga = totalWeightTons > 0 ? Math.round((totalWeightTons / reportLoadRate) * 100) / 100 : 0;
    const diasDescarga = totalWeightTons > 0 ? Math.round((totalWeightTons / reportDischRate) * 100) / 100 : 0;
    const diasNavegacion = Math.round((reportDistance / (reportSpeed * 24)) * 100) / 100;
    const diasRotacionTotal = Math.round((diasCarga + diasDescarga + diasNavegacion) * 100) / 100;

    // Demoras
    const actualLoad = sourcePayload?.route_and_chartering?.actual_loading_days ?? (actualLoadingDays !== '' ? Number(actualLoadingDays) : null);
    const actualDisch = sourcePayload?.route_and_chartering?.actual_discharging_days ?? (actualDischargingDays !== '' ? Number(actualDischargingDays) : null);
    const demLoadDays = (actualLoad !== null && actualLoad > diasCarga) ? Math.round((actualLoad - diasCarga) * 100) / 100 : 0;
    const demDischDays = (actualDisch !== null && actualDisch > diasDescarga) ? Math.round((actualDisch - diasDescarga) * 100) / 100 : 0;
    const reportDemDays = Math.round((demLoadDays + demDischDays) * 100) / 100;
    const reportDemDailyUsd = Number(sourcePayload?.route_and_chartering?.demurrage_daily_rate_usd ?? demurrageDailyRateUsd) || reportDailyHire;
    const demurrageCostNum = Math.round(reportDemDays * reportDemDailyUsd * reportExRate * 100) / 100;

    // Subtotal 1: Flete Marítimo / TCE
    let fleteCostNum = 0;
    if (sourcePayload?.financial_summary?.subtotal_ocean_freight_eur != null && Number(sourcePayload.financial_summary.subtotal_ocean_freight_eur) > 0) {
      fleteCostNum = Number(sourcePayload.financial_summary.subtotal_ocean_freight_eur);
    } else if (parseFloat(subtotalFreight) > 0) {
      fleteCostNum = parseFloat(subtotalFreight);
    } else {
      fleteCostNum = Math.round(diasRotacionTotal * reportDailyHire * reportExRate * 100) / 100;
    }
    const fleteSaleNum = fleteCostNum * 1.15;
    const fleteMarginNum = fleteSaleNum - fleteCostNum;

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
    const chainsCount = isBigBags ? 0 : (sourcePayload?.lashing_and_dunnage_materials?.chains_and_binders ?? chainsBinders);
    const slingsCount = isBigBags ? 0 : (sourcePayload?.lashing_and_dunnage_materials?.high_capacity_slings ?? highCapacitySlings);

    const matCostNum = (mafiCount * 300) + (heavyLiftCount * 2500) + portCraneCost + spreaderCost + airBagsCost + (dunnageCount * 30) + (chainsCount * 80) + (slingsCount * 40);
    const matSaleNum = matCostNum * 1.15;
    const matMarginNum = matSaleNum - matCostNum;

    // Logística Periférica (Pre-Stacking 70%, Manipulación Inicial, Almacenaje, Surveyor, Inland, Aduanas)
    const sDays = sourcePayload?.peripheral_services?.storage_days ?? storageDays;
    const survCost = Number(sourcePayload?.peripheral_services?.surveyor_cost ?? surveyorCost) || 0;
    const inlCost = Number(sourcePayload?.peripheral_services?.inland_cost ?? inlandCost) || 0;
    const custCost = Number(sourcePayload?.peripheral_services?.customs_cost ?? customsCost) || 0;

    let storageCostNum = 0;
    let initialHandlingCost = 0;
    if (isBigBags) {
      const preStackRatio = 0.70;
      const preStackedTons = totalWeightTons * preStackRatio;
      const preStackDays = Math.max(5, Number(sDays) || 5);
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

    const fobSubtotal = estibaCostNum + matCostNum + periCostNum + demurrageCostNum;
    const finalTotalCost = Math.round((fleteCostNum + fobSubtotal) * 100) / 100;
    const finalTotalSale = Math.round((finalTotalCost * 1.15) * 100) / 100;
    const finalTotalMargin = Math.round((finalTotalSale - finalTotalCost) * 100) / 100;
    const unitRateSale = reportRT > 0 ? finalTotalSale / reportRT : 0;

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
      diasNavegacion,
      diasRotacionTotal,
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
      craneCostNum: (heavyLiftCount * 2500) + portCraneCost,
      storageCostNum,
      initialHandlingCost,
    };
  };

  const handleOpenExecutiveReport = (item = null) => {
    const data = buildExecutiveReportData(item);
    setReportData(data);
    setShowExecutiveReport(true);
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
      userEditedSurveyor.current = (peri.surveyor_cost || peri.surveyorCost) != null;
      const fin = payload.financial_summary || {};
      if (fin.subtotal_ocean_freight_eur != null) setSubtotalFreight(String(fin.subtotal_ocean_freight_eur));
      if (fin.subtotal_fob_operations_eur != null) setSubtotalFobOperations(String(fin.subtotal_fob_operations_eur));
      setEstimatedCost(fin.estimated_total_cost_eur ? String(fin.estimated_total_cost_eur) : ''); setSalePrice(fin.customer_sale_price_eur ? String(fin.customer_sale_price_eur) : '');

      const repData = buildExecutiveReportData(item);
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
    console.log('Guardar Flete y Estiba en Proyecto:', {
      cargoItems,
      subtotalFreight,
      subtotalFobOperations,
      estimatedCost,
      salePrice
    });
    const currentReportSnapshot = buildExecutiveReportData();
    setReportData(currentReportSnapshot);

    const payload = {
      project_ref: activeProject?.project_ref,
      cargo_items: cargoItems.map((item) => ({
        id: item.id,
        category: item.category || 'Equipos de Proceso', quantity: parseInt(item.quantity, 10) || 1, type: item.type || 'Sin especificar',
        length_m: parseFloat(item.length) || 0, width_m: parseFloat(item.width) || 0, height_m: parseFloat(item.height) || 0, unit_weight_kg: parseFloat(item.weight) || 0, shipping_mode_supported: item.shipping_mode_supported || "40' HC Contenedor"
      })),
      lashing_and_dunnage_materials: {
        dunnage_wood: dunnageWood,
        high_capacity_slings: highCapacitySlings,
        chains_and_binders: chainsBinders,
        shackles: shackles,
        spreader_multipunto: spreaderMultipunto,
      },
      port_labor_and_equipment: {
        stevedore_gangs_shifts: stevedoreGangs,
        lashing_team: lashingTeam,
        heavy_lift_crane: heavyLiftCrane,
        mafi_platforms: mafiPlatforms,
        port_crane_shifts: isBigBagsCargo ? stevedoreGangs : 0,
      },
      peripheral_services: {
        storage_days: storageDays,
        surveyor_cost: surveyorCost,
        inland_cost: inlandCost,
        customs_cost: customsCost,
      },
      shipping_mode: shippingMode,
      recommended_vessel: vesselType,
      route_and_chartering: {
        pol,
        pod,
        distance_nm: distanceNm,
        loading_rate_mt_day: loadingRate,
        discharging_rate_mt_day: dischargingRate,
        vessel_speed_knots: vesselSpeedKnots,
        daily_hire_rate_usd: vesselDailyHireUsd,
        exchange_rate: exchangeRateUsdEur,
        dias_carga: currentReportSnapshot.diasCarga,
        dias_descarga: currentReportSnapshot.diasDescarga,
        dias_navegacion: currentReportSnapshot.diasNavegacion,
        dias_rotacion_total: currentReportSnapshot.diasRotacionTotal,
        actual_loading_days: actualLoadingDays,
        actual_discharging_days: actualDischargingDays,
        demurrage_days: currentReportSnapshot.demurrageDays,
        demurrage_daily_rate_usd: demurrageDailyRateUsd,
        demurrage_cost_eur: currentReportSnapshot.demurrageCostNum,
        demurrage_status: currentReportSnapshot.demurrageStatus,
      },
      totals: { ...totals },
      financial_summary: {
        subtotal_ocean_freight_eur: parseFloat(subtotalFreight) || currentReportSnapshot.fleteCostNum || 0,
        subtotal_fob_operations_eur: parseFloat(subtotalFobOperations) || (currentReportSnapshot.estibaCostNum + currentReportSnapshot.matCostNum + currentReportSnapshot.periCostNum) || 0,
        estimated_total_cost_eur: parseFloat(estimatedCost) || currentReportSnapshot.finalTotalCost || 0,
        customer_sale_price_eur: parseFloat(salePrice) || currentReportSnapshot.finalTotalSale || 0,
        crane_cost_eur: currentReportSnapshot.craneCostNum || 0,
        storage_cost_eur: currentReportSnapshot.storageCostNum || 0,
        initial_handling_cost_eur: currentReportSnapshot.initialHandlingCost || 0,
      },
      executive_report_snapshot: currentReportSnapshot,
    };
    const lineItemCost = parseFloat(estimatedCost) || currentReportSnapshot.finalTotalCost || 0;
    const lineItemPrice = parseFloat(salePrice) || currentReportSnapshot.finalTotalSale || 0;
    const savedLineItem = {
      id: editingLineItemId || `item-${Date.now()}`,
      description: `Flete y Estiba Project Cargo (${totals.quantity || currentReportSnapshot.totals.quantity} piezas, ${(totals.weight || currentReportSnapshot.totals.weight).toLocaleString('es-ES')} kg)`,
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
      await persistProjectToDatabase(updatedProject);
    }
    setCargoItems([]);
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
      <div className={`w-full h-full flex overflow-hidden bg-slate-950 text-slate-100 font-sans relative ${showExecutiveReport ? 'print:hidden' : ''}`}>
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
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-slate-900">Servicios</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenExecutiveReport(activeProject.line_items[0])}
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
                        {activeProject.line_items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-semibold">{item.description}</td>
                            <td className="px-4 py-3 text-right text-rose-600 font-bold">{Number(item.cost_eur).toLocaleString('es-ES')} €</td>
                            <td className="px-4 py-3 text-right text-emerald-600 font-bold">{Number(item.sale_price_eur).toLocaleString('es-ES')} €</td>
                            <td className="px-4 py-3 text-center">
                              <button type="button" onClick={() => handleOpenExecutiveReport(item)} className="mx-1 cursor-pointer hover:scale-110 transition-transform" title="Generar Reporte Ejecutivo">📄</button>
                              <button onClick={() => handleEditService(item)} className="mx-1 cursor-pointer">✏️</button>
                              <button onClick={() => handleDeleteService(item.id)} className="mx-1 cursor-pointer">🗑️</button>
                            </td>
                          </tr>
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
        {isCargoModalOpen && !showExecutiveReport && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto print:hidden">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col overflow-hidden text-slate-900">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Project Cargo Builder</h2>
                <button onClick={() => setIsCargoModalOpen(false)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center justify-center font-bold">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 divide-y divide-slate-100">
                <section className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">1. Lista de Empaque (Packing List)</h3>
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
                      <button onClick={handleAddCargoPiece} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-sm">+ Añadir Pieza</button>
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
                              <td className="p-1"><input type="text" value={item.type || ''} onChange={(e) => handleUpdateCargoItem(item.id, 'type', e.target.value)} className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded px-2 py-1.5 text-slate-900 font-semibold text-[11px]" placeholder="Descripción de pieza..." /></td>
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

                    {/* Resumen dinámico en vivo */}
                    {(() => {
                      const wTons = (totals.weight || 0) / 1000;
                      const effLoad = Math.max(1, Number(loadingRate) || 1200);
                      const effDisch = Math.max(1, Number(dischargingRate) || 1000);
                      const dCarga = wTons > 0 ? Math.round((wTons / effLoad) * 100) / 100 : 0;
                      const dDescarga = wTons > 0 ? Math.round((wTons / effDisch) * 100) / 100 : 0;
                      const effDist = Math.max(10, Number(distanceNm) || 1500);
                      const effSpd = Math.max(1, Number(vesselSpeedKnots) || 12.0);
                      const dNav = Math.round((effDist / (effSpd * 24)) * 100) / 100;
                      const dRot = Math.round((dCarga + dDescarga + dNav) * 100) / 100;
                      const aLoad = actualLoadingDays !== '' && actualLoadingDays !== null && !isNaN(Number(actualLoadingDays)) ? Number(actualLoadingDays) : null;
                      const aDisch = actualDischargingDays !== '' && actualDischargingDays !== null && !isNaN(Number(actualDischargingDays)) ? Number(actualDischargingDays) : null;
                      const demLoad = (aLoad !== null && aLoad > dCarga) ? Math.round((aLoad - dCarga) * 100) / 100 : 0;
                      const demDisch = (aDisch !== null && aDisch > dDescarga) ? Math.round((aDisch - dDescarga) * 100) / 100 : 0;
                      const totalDem = Math.round((demLoad + demDisch) * 100) / 100;
                      const demPenalty = Math.round(totalDem * (Number(demurrageDailyRateUsd) || 11500) * (Number(exchangeRateUsdEur) || 0.92) * 100) / 100;

                      return (
                        <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                          <div className="bg-white p-2 rounded border border-slate-200">
                            <span className="block text-[9px] uppercase font-bold text-slate-500">Días Carga (POL)</span>
                            <span className="text-sm font-black text-slate-800 font-mono">{dCarga.toFixed(2)} d</span>
                            <span className="block text-[9px] text-slate-400">({wTons.toFixed(1)} MT / {effLoad} MT/d)</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-200">
                            <span className="block text-[9px] uppercase font-bold text-slate-500">Días Descarga (POD)</span>
                            <span className="text-sm font-black text-slate-800 font-mono">{dDescarga.toFixed(2)} d</span>
                            <span className="block text-[9px] text-slate-400">({wTons.toFixed(1)} MT / {effDisch} MT/d)</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-200">
                            <span className="block text-[9px] uppercase font-bold text-slate-500">Días Navegación</span>
                            <span className="text-sm font-black text-blue-700 font-mono">{dNav.toFixed(2)} d</span>
                            <span className="block text-[9px] text-slate-400">({effDist} NM @ {effSpd} kn)</span>
                          </div>
                          <div className={`p-2 rounded border ${totalDem > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                            <span className="block text-[9px] uppercase font-bold text-slate-600">
                              {totalDem > 0 ? '⚠️ Demoras Muelle' : '✅ Plancha / Demoras'}
                            </span>
                            <span className={`text-sm font-black font-mono ${totalDem > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                              {totalDem > 0 ? `+${totalDem.toFixed(2)} d (+${demPenalty.toLocaleString('es-ES')} €)` : 'En Plancha'}
                            </span>
                            <span className="block text-[9px] text-slate-500">Rotación Total: {dRot.toFixed(2)} d</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </section>

                <section className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">2. Trincaje y Materiales</h3>
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
                    <NumericCounter label="Maderas de Estiba (Dunnage)" subtitle={isBigBagsCargo ? "Excluidas (Big Bags)" : "Dunnage"} value={dunnageWood} onChange={setDunnageWood} />
                    <NumericCounter label="Eslingas de alta capacidad" subtitle={isBigBagsCargo ? "Prohibidas (Usar Spreader)" : "Alta Capacidad"} value={highCapacitySlings} onChange={setHighCapacitySlings} />
                    <NumericCounter label="Cadenas y Tensores" subtitle={isBigBagsCargo ? "Excluidas (Big Bags)" : "Trincaje Pesado"} value={chainsBinders} onChange={setChainsBinders} />
                    <NumericCounter label="Grilletes" subtitle={isBigBagsCargo ? "Excluidos (Big Bags)" : "Unión de Trincas"} value={shackles} onChange={setShackles} />
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
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Días Almacenaje</label><input type="number" value={storageDays} onChange={(e) => setStorageDays(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Surveyor (€)</label><input type="number" value={surveyorCost} onChange={(e) => { userEditedSurveyor.current=true; setSurveyorCost(e.target.value); }} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Transporte Inland (€)</label><input type="number" value={inlandCost} onChange={(e) => setInlandCost(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200"><label className="text-xs font-bold block mb-2">Aduanas (€)</label><input type="number" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2" /></div>
                  </div>
                </section>

                <section className="pt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider">5. Desglose Financiero Separado (Flete vs. FOB / Operativa)</h3>
                    <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">SeaCharter Core PRO</span>
                  </div>

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
                            <span id="subtotal-ocean-freight" className="text-2xl font-mono font-black text-sky-300">{subtotalFreight}</span>
                            <span className="text-xs font-mono font-semibold text-slate-400 ml-1.5">EUR</span>
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
                            Manipulación en muelle, estiba y desestiba, trincaje, almacenaje terminal, peritaje, inland y aduanas
                          </p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-700/80 flex items-baseline justify-between">
                          <span className="text-[11px] font-mono text-slate-400">Subtotal FOB/Operativa:</span>
                          <div className="flex items-baseline">
                            <span id="subtotal-fob-operations" className="text-2xl font-mono font-black text-amber-300">{subtotalFobOperations}</span>
                            <span className="text-xs font-mono font-semibold text-slate-400 ml-1.5">EUR</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="bg-slate-50 p-6 border-t border-slate-200 flex justify-between items-end shrink-0">
                <div className="flex gap-6 w-1/2">
                  <div className="w-full relative">
                    <label htmlFor="input-estimated-cost" className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Coste Total Estimado (€)</label>
                    <input id="input-estimated-cost" type="number" readOnly value={estimatedCost} className="w-full bg-slate-800 text-white font-bold text-2xl text-right p-3 pr-14 rounded border border-slate-600 outline-none focus:border-cyan-500 shadow-inner" />
                    <span className="absolute right-3.5 bottom-3 text-xs text-slate-400 font-mono font-semibold">EUR</span>
                  </div>
                  <div className="w-full relative">
                    <label htmlFor="input-sale-price" className="block text-blue-600 font-bold text-[10px] uppercase mb-1">Precio Venta a Cliente (€)</label>
                    <input id="input-sale-price" type="number" readOnly value={salePrice} className="w-full bg-slate-800 text-white font-bold text-2xl text-right p-3 pr-14 rounded border border-slate-600 outline-none focus:border-cyan-500 shadow-inner" />
                    <span className="absolute right-3.5 bottom-3 text-xs text-slate-400 font-mono font-semibold">EUR</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button id="btn-generate-executive-report" onClick={() => { handleOpenExecutiveReport(); setShowExecutiveReport(true); }} className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded shadow font-bold text-sm cursor-pointer">📄 Generar Reporte Ejecutivo</button>
                  <button onClick={handleSaveProjectCargo} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded shadow font-bold text-sm cursor-pointer">💾 Guardar Flete y Estiba en Proyecto</button>
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
        const formatCurrency = (val) => Number(val || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

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

        return (
          <div className="fixed inset-0 bg-white z-[9000] overflow-y-auto pt-20 pb-10 px-4 sm:px-10 text-slate-900 print:bg-white print:p-0">
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                #printable-a4-sheet, #printable-a4-sheet * { visibility: visible !important; }
                #printable-a4-sheet { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 12mm !important; border: none !important; box-shadow: none !important; }
                .print-hidden { display: none !important; }
                @page { size: A4 portrait; margin: 0; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
            `}</style>

            <div className="fixed top-6 right-8 flex gap-4 z-[9999] print:hidden">
              <button id="btn-print-executive-report" onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full shadow-2xl font-black flex items-center gap-2 border-2 border-white cursor-pointer hover:scale-105 transition-transform">
                🖨️ Imprimir / Guardar PDF
              </button>
              <button id="btn-close-executive-report" onClick={() => setShowExecutiveReport(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl font-black flex items-center gap-2 border-2 border-white cursor-pointer hover:scale-105 transition-transform">
                ✖ Cerrar Reporte
              </button>
            </div>

            <div id="printable-a4-sheet" className="max-w-4xl mx-auto p-10 bg-white text-slate-900 shadow-xl border border-slate-300 rounded">
              
              <header className="border-b-2 border-slate-200 pb-4 mb-6 flex justify-between items-end">
                <div>
                  <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
                    Universal Forwarding / B2B Module
                  </h1>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    OFERTA COMERCIAL - PROJECT CARGO
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-600 font-mono">
                  <div className="mb-1"><span className="font-bold text-slate-800 uppercase text-[10px] mr-2">Fecha de Emisión:</span>{new Date().toLocaleDateString('es-ES')}</div>
                  <div className="mb-1"><span className="font-bold text-slate-800 uppercase text-[10px] mr-2">Referencia del Proyecto:</span>{activeProject?.project_ref || 'EXP-SIN-REF'}</div>
                  <div><span className="font-bold text-slate-800 uppercase text-[10px] mr-2">Cliente:</span><span className="font-bold text-blue-700">{activeProject?.client_name || 'Sin Cliente'}</span></div>
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
                    <span className="text-xs font-black text-slate-900 mt-1 block">{activeReport.pol || 'Valencia'} ➔ {activeReport.pod || 'Houston'}</span>
                    <span className="block text-[9px] text-slate-500 font-mono">{(activeReport.distanceNm || 4850).toLocaleString('es-ES')} NM</span>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Ritmos Carga / Descarga</span>
                    <span className="text-xs font-black text-slate-900 mt-1 block">{(activeReport.loadingRate || 1200).toLocaleString('es-ES')} / {(activeReport.dischargingRate || 1000).toLocaleString('es-ES')} MT/d</span>
                    <span className="block text-[9px] text-slate-500">Velocidad: {activeReport.vesselSpeedKnots || 12} nudos</span>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Rotación Buque (D_total)</span>
                    <span className="text-xs font-black text-blue-700 mt-1 block font-mono">{(activeReport.diasRotacionTotal || 10).toFixed(2)} días</span>
                    <span className="block text-[9px] text-slate-500">({(activeReport.diasCarga || 1.5).toFixed(1)}d C + {(activeReport.diasDescarga || 1.8).toFixed(1)}d D + {(activeReport.diasNavegacion || 6.7).toFixed(1)}d Nav)</span>
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

              <section className="mb-6 print-exact">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-2 border-b-2 border-slate-200 pb-1">🚢 Croquis Esquemático de Estiba (Stowage Plan)</h3>
                <div className="bg-slate-50 border border-slate-300 p-3 rounded overflow-x-auto text-[9px] leading-tight font-mono whitespace-pre text-slate-800">
                  {getStowageAscii()}
                </div>
              </section>

              <section className="mb-6">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-3 border-b-2 border-slate-200 pb-2">
                  📋 Desglose Financiero Separado (Flete Marítimo vs. Costes FOB / Operativa Portuaria)
                </h3>
                <table className="border-collapse w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 uppercase font-bold border-y-2 border-slate-300">
                      <th className="py-2.5 px-3 text-left">Concepto</th>
                      <th className="py-2.5 px-3 text-left">Descripción</th>
                      <th className="py-2.5 px-3 text-right">Coste (€)</th>
                      <th className="py-2.5 px-3 text-right">Venta (€)</th>
                      <th className="py-2.5 px-3 text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* Fila 1: Flete Marítimo (Base RT) */}
                    <tr className="hover:bg-slate-50 bg-sky-50/40">
                      <td className="py-2.5 px-3 font-bold text-sky-900">Flete Marítimo (Base RT)</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        Ocean Freight / TCE de buque fletado sobre base W/M ({reportRT.toFixed(2)} RT) · Rotación {(activeReport.diasRotacionTotal || 10).toFixed(2)} d ({(activeReport.diasCarga || 1.5).toFixed(2)}d carga, {(activeReport.diasDescarga || 1.8).toFixed(2)}d descarga, {(activeReport.diasNavegacion || 6.7).toFixed(2)}d nav) · {(activeReport.dailyRateUsd || 11500).toLocaleString('es-ES')} USD/día
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">{formatCurrency(fleteCostNum)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-700">{formatCurrency(fleteSaleNum)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">{formatCurrency(fleteMarginNum)}</td>
                    </tr>
                    {/* Fila 2: Estiba y Trincaje (Cuadrillas, Trincadores) */}
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">Estiba y Trincaje (Cuadrillas, Trincadores)</td>
                      <td className="py-2.5 px-3 text-slate-600">Turnos de estibadores en muelle y cuadrillas de trincaje especializado</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">{formatCurrency(estibaCostNum)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(estibaSaleNum)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">{formatCurrency(estibaMarginNum)}</td>
                    </tr>
                    {/* Fila 3: Materiales Especiales (MAFIs, Heavy Lift, Cadenas, Dunnage) */}
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">Materiales Especiales (MAFIs, Heavy Lift, Cadenas, Dunnage)</td>
                      <td className="py-2.5 px-3 text-slate-600">Grúa auxiliar, roll trailers MAFI, dunnage, eslingas y cadenas certificadas</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">{formatCurrency(matCostNum)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(matSaleNum)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">{formatCurrency(matMarginNum)}</td>
                    </tr>
                    {/* Fila 4: Logística Periférica (Almacenaje Portuario, Surveyor, Transporte Inland, Aduanas) */}
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">Logística Periférica (Almacenaje Portuario, Surveyor, Transporte Inland, Aduanas)</td>
                      <td className="py-2.5 px-3 text-slate-600">Almacenaje muelle ({activeReport.storageDays ?? storageDays} d), surveyor portuario, transporte inland y aduanas</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">{formatCurrency(periCostNum)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(periSaleNum)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">{formatCurrency(periMarginNum)}</td>
                    </tr>
                    {/* Fila Demoras: Penalización por Exceso de Estadía si existe */}
                    {activeReport.demurrageDays > 0 && (
                      <tr className="hover:bg-amber-50 bg-amber-50/60 font-semibold">
                        <td className="py-2.5 px-3 font-bold text-amber-950">Demoras y Sobrecostes de Muelle (Demurrage)</td>
                        <td className="py-2.5 px-3 text-amber-900">
                          Penalización automática por exceso de tiempo en muelle ({activeReport.demurrageDays.toFixed(2)} d) a {(activeReport.demurrageDailyRateUsd || 11500).toLocaleString('es-ES')} USD/día
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-950 font-bold">{formatCurrency(activeReport.demurrageCostNum)}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-800">{formatCurrency(activeReport.demurrageCostNum * 1.15)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">{formatCurrency(activeReport.demurrageCostNum * 0.15)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              {/* Subtotales destacados: Flete vs FOB / Operativa */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-sky-50 border border-sky-200 p-4 rounded-lg">
                  <span className="block text-[10px] font-bold text-sky-700 uppercase tracking-wide">Subtotal Flete Marítimo / TCE</span>
                  <div className="text-xl font-black font-mono text-sky-900 mt-1">{formatCurrency(activeReport.subtotalFreight || fleteCostNum)}</div>
                  <span className="text-[10px] text-sky-600 font-semibold">Precio Venta Flete: {formatCurrency(fleteSaleNum)}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                  <span className="block text-[10px] font-bold text-amber-700 uppercase tracking-wide">Subtotal Costes FOB y Operativa Portuaria</span>
                  <div className="text-xl font-black font-mono text-amber-900 mt-1">{formatCurrency(activeReport.subtotalFobOperations || (estibaCostNum + matCostNum + periCostNum))}</div>
                  <span className="text-[10px] text-amber-600 font-semibold">Precio Venta Operativa: {formatCurrency(parseFloat(activeReport.subtotalFobOperations || (estibaCostNum + matCostNum + periCostNum)) * 1.15)}</span>
                </div>
              </div>

              {/* Importe Total de Cotización / Venta (All-In) */}
              <div className="bg-slate-100 border-2 border-slate-900 p-6 rounded-lg flex justify-between items-center mb-8">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-600 tracking-widest block mb-1">Importe Total Cotización (All-In)</span>
                  <h2 className="text-2xl font-black uppercase text-slate-900">PRECIO TOTAL DE VENTA AL CLIENTE</h2>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1 rounded text-xs font-bold font-mono">
                      Tarifa All-In: {formatCurrency(unitRateSale)} / RT (W/M)
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">Cálculo sobre {reportRT.toFixed(2)} Revenue Tons</span>
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
            </div>
          </div>
        );
      })()}

      <AgenteProyectosWidget
        onUpdatePayload={handleApplyProjectPayload}
        isOpen={isAgentVisible}
        onToggleOpen={setIsAgentVisible}
        cargoItems={cargoItems}
        financialData={{ subtotalFreight, subtotalFobOperations, estimatedCost, salePrice }}
      />
    </>
  );
}

export default ForwarderWorkspace;
