import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'sea_charter_v2_session';

// TypeScript Interface for Vessel data structure
export interface Vessel {
  vessel_name: string;
  dwt: number;
  loa: string;
  draft: string;
  spd_ballast: number;
  spd_laden: number;
  cons_sea: number;
  cons_port: number;
}

export default function ShipComparison() {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // --- Form State hooks ---
  const [name, setName] = useState<string>('');
  const [dwt, setDwt] = useState<string | number>('');
  const [loa, setLoa] = useState<string | number>('');
  const [draft, setDraft] = useState<string | number>('');
  const [speed, setSpeed] = useState<string | number>('');
  const [consumption, setConsumption] = useState<string | number>('');

  // --- Initialization state for Draft Recovery ---
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // --- UI feedback states ---
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // --- State for the list of saved vessels displayed in the table ---
  const [savedVessels, setSavedVessels] = useState<Vessel[]>([]);

  // --- Session cleanup function ---
  const cleanSession = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  // --- Clear Session helper function ---
  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  // --- Cleaning Corrupted Data ---
  const clearOldKeys = () => {
    localStorage.removeItem('sea_charter_session_data');
    localStorage.removeItem('draft_auditoria');
  };

  // --- Global Form State getter ---
  const formData = {
    name,
    dwt,
    loa,
    draft,
    speed,
    consumption,
  };

  // --- Global Form State setter ---
  const setFormData = (data: any) => {
    if (data) {
      if (data.name !== undefined) setName(data.name);
      if (data.dwt !== undefined) setDwt(data.dwt);
      if (data.loa !== undefined) setLoa(data.loa);
      if (data.draft !== undefined) setDraft(data.draft);
      if (data.speed !== undefined) setSpeed(data.speed);
      if (data.consumption !== undefined) setConsumption(data.consumption);
    }
  };

  // --- Check if form has unsaved changes compared to last saved session ---
  const hasChanges = () => {
    const savedStr = localStorage.getItem(STORAGE_KEY);
    if (!savedStr) {
      return !!(name.trim() || dwt || loa || draft || speed || consumption);
    }
    try {
      const savedData = JSON.parse(savedStr);
      return (
        name !== (savedData.name ?? '') ||
        dwt !== (savedData.dwt ?? '') ||
        loa !== (savedData.loa ?? '') ||
        draft !== (savedData.draft ?? '') ||
        speed !== (savedData.speed ?? '') ||
        consumption !== (savedData.consumption ?? '')
      );
    } catch (e) {
      return true;
    }
  };

  // Export: The JSON is saved as an encoded string so the CSV file isn't broken
  const exportToCSV = (data: any) => {
    const jsonString = JSON.stringify(data);
    const csvContent = "data:text/csv;charset=utf-8,json_data\n" + btoa(unescape(encodeURIComponent(jsonString))); // We use Base64 for maximum security
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const rawFilename = `auditoria_${data.nombreBarco || data.name || 'sesion'}.csv`;
    const safeFilename = rawFilename.replace(/[:\\/*?"<>|]/g, "_");
    link.setAttribute("download", safeFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Save Session action ---
  const handleSaveSession = () => {
    clearOldKeys();
    if (formData && Object.keys(formData).length > 0) {
      // Ensures text fields don't break the JSON format
      const cleanData = JSON.parse(JSON.stringify(formData).replace(/[\r\n\t]/g, " "));
      exportToCSV(cleanData);
      showNotification('success', 'Session saved successfully');
      alert("Session saved successfully");
    }
  };

  // Import: Decodes the JSON regardless of the number of fields
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result as string;
        if (!result || !result.trim()) {
          throw new Error("Empty file");
        }
        const lines = result.split("\n");
        if (lines.length < 2) {
          throw new Error("Invalid file structure");
        }
        const text = lines[1]?.trim();
        if (!text) {
          throw new Error("No data row found");
        }

        // Safe decoder for UTF-8
        const decodeBase64 = (str: string) => {
          return decodeURIComponent(atob(str).split('').map(c =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
          ).join(''));
        };

        const decodedData = JSON.parse(decodeBase64(text)); // Decode the JSON
        setFormData(decodedData);
        showNotification('success', 'Session loaded');
        alert("Session loaded");
      } catch (err) {
        alert("Error: El archivo no tiene el formato esperado. Asegúrate de cargar un archivo exportado desde la propia aplicación.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- Load Session action ---
  const handleLoadSession = () => {
    fileInputRef.current?.click();
  };

  // --- Exit action ---
  const handleExit = () => {
    window.location.href = '/';
  };

  const handleSalir = () => {
    handleExit();
  };

  // --- Hard Reset (Maintenance) ---
  const hardReset = () => {
    const confirmReset = window.confirm('Are you sure you want to perform a hard reset? This will clear all local storage data, including saved vessels and active sessions, and reload the page.');
    if (confirmReset) {
      localStorage.clear();
      window.location.reload();
    }
  };

  // --- Auto-save helper function ---
  const autoSave = (currentData: {
    name: string;
    dwt: string | number;
    loa: string | number;
    draft: string | number;
    speed: string | number;
    consumption: string | number;
  }) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
  };

  // --- Finish Audit action ---
  const handleFinishAudit = () => {
    cleanSession();
    // Clear form input states
    setName('');
    setDwt('');
    setLoa('');
    setDraft('');
    setSpeed('');
    setConsumption('');
    showNotification('success', 'Auditoría finalizada. El borrador ha sido limpiado.');
  };

  // --- Prevent closure (beforeunload event listener) ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsavedData = name.trim() || dwt || loa || draft || speed || consumption;
      if (hasUnsavedData) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [name, dwt, loa, draft, speed, consumption]);

  // --- Recovery on load (Mount effect) ---
  useEffect(() => {
    const draftStr = localStorage.getItem(STORAGE_KEY);
    if (draftStr) {
      try {
        const draftData = JSON.parse(draftStr);
        if (draftData) {
          const recover = window.confirm('An incomplete session has been detected. Do you want to recover the data?');
          if (recover) {
            if (draftData.name !== undefined) setName(draftData.name);
            if (draftData.dwt !== undefined) setDwt(draftData.dwt);
            if (draftData.loa !== undefined) setLoa(draftData.loa);
            if (draftData.draft !== undefined) setDraft(draftData.draft);
            if (draftData.speed !== undefined) setSpeed(draftData.speed);
            if (draftData.consumption !== undefined) setConsumption(draftData.consumption);
            showNotification('success', 'Form data recovered successfully from draft.');
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch (e) {
        console.error('Error parsing draft from localStorage:', e);
      }
    }
    setIsInitialized(true);
  }, []);

  // --- Auto-save to LocalStorage effect ---
  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const hasData = name.trim() || dwt || loa || draft || speed || consumption;
    if (hasData) {
      const formData = {
        name,
        dwt,
        loa,
        draft,
        speed,
        consumption,
      };
      autoSave(formData);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [name, dwt, loa, draft, speed, consumption, isInitialized]);

  // --- useEffect to load the vessels from localStorage on mount and automatically sync ---
  useEffect(() => {
    const loadVessels = () => {
      const stored = localStorage.getItem('rodahmar_saved_vessels');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setSavedVessels(parsed);
          }
        } catch (e) {
          console.error('Error parsing saved vessels:', e);
        }
      }
    };

    loadVessels();

    // Listen for storage changes to sync across other tabs/components automatically
    window.addEventListener('storage', loadVessels);
    return () => {
      window.removeEventListener('storage', loadVessels);
    };
  }, []);

  // Helper to show inline notifications
  const showNotification = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => {
      setMessage(null);
    }, 5000);
  };

  // --- 'Extract Data' function ---
  const handleExtraerDatos = async () => {
    if (!name.trim()) {
      showNotification('error', 'Por favor, introduce un nombre de buque.');
      return;
    }

    setIsLoading(true);
    setMessage({ type: 'info', text: 'Extrayendo especificaciones del buque con IA...' });

    try {
      const response = await fetch('/api/ship-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ship_name: name.trim() }),
      });

      if (!response.ok) {
        throw new Error('La extracción de datos falló.');
      }

      const data = await response.json();

      // Map incoming API data to corresponding react state setters
      if (data.Vessel_Name && data.Vessel_Name !== 'N/A') {
        setName(data.Vessel_Name);
      }
      if (data.DWT && data.DWT !== 'N/A') {
        setDwt(Math.round(Number(data.DWT)));
      }
      if (data.LOA && data.LOA !== 'N/A') {
        setLoa(data.LOA);
      }
      if (data.Draft && data.Draft !== 'N/A') {
        setDraft(data.Draft);
      }
      
      // Map Speed
      if (data.Speed_Ballast && data.Speed_Ballast !== 'N/A') {
        setSpeed(Number(data.Speed_Ballast));
      } else if (data.Speed_Laden && data.Speed_Laden !== 'N/A') {
        setSpeed(Number(data.Speed_Laden));
      }

      // Map Consumption
      if (data.Cons_Sea && data.Cons_Sea !== 'N/A') {
        setConsumption(Number(data.Cons_Sea));
      } else if (data.Daily_Consumption && data.Daily_Consumption !== 'N/A') {
        setConsumption(Number(data.Daily_Consumption));
      }

      showNotification('success', `🚢 Especificaciones de "${data.Vessel_Name || name.trim()}" extraídas con éxito.`);
    } catch (error) {
      console.error('Error extracting vessel data:', error);
      showNotification('error', 'No se pudieron extraer datos para este buque.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- 'Save' function ---
  const handleGuardar = () => {
    if (!name.trim()) {
      showNotification('error', 'Por favor, ingrese un nombre para el buque.');
      return;
    }

    // Create vessel object with current state values
    const newVessel: Vessel = {
      vessel_name: name.trim(),
      dwt: dwt ? Number(dwt) : 0,
      loa: loa ? String(loa) : '',
      draft: draft ? String(draft) : '',
      spd_ballast: speed ? Number(speed) : 12.0,
      spd_laden: speed ? Number(speed) : 11.0,
      cons_sea: consumption ? Number(consumption) : 10.0,
      cons_port: 1.5,
    };

    // Read existing array from localStorage
    const storedVesselsStr = localStorage.getItem('rodahmar_saved_vessels');
    let savedList: Vessel[] = [];
    if (storedVesselsStr) {
      try {
        savedList = JSON.parse(storedVesselsStr);
        if (!Array.isArray(savedList)) {
          savedList = [];
        }
      } catch (e) {
        savedList = [];
      }
    }

    // Avoid duplicates: case-insensitive check on vessel name
    const isDuplicate = savedList.some(
      (v) => (v.vessel_name || '').trim().toLowerCase() === newVessel.vessel_name.toLowerCase()
    );

    if (!isDuplicate) {
      const updatedList = [...savedList, newVessel];
      // Update localStorage
      localStorage.setItem('rodahmar_saved_vessels', JSON.stringify(updatedList, null, 2));
      // Set the state which triggers the automatic reload/re-render of the table
      setSavedVessels(updatedList);
      showNotification('success', `⚓ El buque "${newVessel.vessel_name}" ha sido guardado.`);
      
      // Cleanup the draft session
      cleanSession();

      // Clear form input states
      setName('');
      setDwt('');
      setLoa('');
      setDraft('');
      setSpeed('');
      setConsumption('');
    } else {
      showNotification('error', `El buque "${newVessel.vessel_name}" ya existe en la lista.`);
    }
  };

  // --- Delete function ---
  const handleEliminar = (indexToDelete: number) => {
    const updatedList = savedVessels.filter((_, index) => index !== indexToDelete);
    localStorage.setItem('rodahmar_saved_vessels', JSON.stringify(updatedList, null, 2));
    setSavedVessels(updatedList);
    showNotification('info', 'Buque eliminado de la biblioteca.');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-300 font-sans max-w-5xl mx-auto space-y-6">
      {/* Header with nautical instrumentation feel */}
      <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-950/50 border border-indigo-500/30 rounded-lg text-indigo-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide uppercase">Biblioteca de Especificaciones de Buques</h2>
            <p className="text-xs text-slate-500">Módulo de extracción por IA y persistencia local</p>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <span className="hidden md:inline-block bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md text-[10px] uppercase font-mono tracking-widest">
            RODAHMAR ENGINE
          </span>
          {/* Session Actions Container */}
          <div className="flex justify-end gap-2" id="session-actions">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
            <button
              onClick={handleSaveSession}
              className="h-9 w-9 rounded-lg border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 hover:text-blue-900 hover:border-blue-900 transition flex items-center justify-center"
              title="Guardar Sesión"
              aria-label="Guardar Sesión"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 3h12l2 2v16H5z" />
                <path d="M8 3v6h8V3" />
                <path d="M8 21v-7h8v7" />
                <path d="M10 17h4" />
              </svg>
            </button>
            <button
              onClick={handleLoadSession}
              className="h-9 w-9 rounded-lg border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 hover:text-blue-900 hover:border-blue-900 transition flex items-center justify-center"
              title="Cargar Sesión"
              aria-label="Cargar Sesión"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7.5V19a2 2 0 0 0 2 2h14.2a2 2 0 0 0 1.95-1.55l1.3-6A2 2 0 0 0 20.5 11H7.2a2 2 0 0 0-1.95 1.55L3 19" />
                <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
            <button
              onClick={hardReset}
              className="bg-amber-600 text-white px-3 py-1.5 rounded hover:bg-amber-700 transition text-xs font-semibold flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
              </svg>
              Hard Reset
            </button>
            <button
              onClick={handleSalir}
              className="h-9 w-9 rounded-lg border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 hover:text-blue-900 hover:border-blue-900 transition flex items-center justify-center"
              title="Salir"
              aria-label="Salir"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications banner */}
      {message && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all duration-300 ${
          message.type === 'success' ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' :
          message.type === 'error' ? 'bg-red-950/40 border-red-500/30 text-red-300' :
          'bg-indigo-950/40 border-indigo-500/30 text-indigo-300'
        }`}>
          {message.type === 'info' && <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-500 border-t-indigo-500 rounded-full inline-block" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Technical Input Panel and Save Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">
            Registro de Buque / Vessel Input
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Nombre del Buque *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-semibold"
                  placeholder="e.g. Acqua Stella"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={handleExtraerDatos}
                  disabled={isLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded transition flex items-center gap-1 shrink-0"
                  title="Extraer especificaciones con IA"
                >
                  {isLoading ? (
                    <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 11-2 0V6H3a1 1 0 110-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 18.5 8.033a1 1 0 01.527 1.725l-3.3 2.768.96 4.414a1 1 0 01-1.503 1.09l-3.684-2.18-3.684 2.18a1 1 0 01-1.503-1.09l.96-4.414-3.3-2.768a1 1 0 01.527-1.725l4.354-.833 1.179-4.456A1 1 0 0112 2z" clipRule="evenodd" />
                    </svg>
                  )}
                  IA
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Capacidad DWT</label>
                <input
                  type="number"
                  value={dwt}
                  onChange={(e) => setDwt(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  placeholder="TM"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 font-mono">Eslora (LOA)</label>
                <input
                  type="text"
                  value={loa}
                  onChange={(e) => setLoa(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  placeholder="e.g. 180m"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Calado Max / Draft</label>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  placeholder="e.g. 10.5m"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Velocidad (kt)</label>
                <input
                  type="number"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  placeholder="Nudos"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Consumo de Mar (t/d)</label>
              <input
                type="number"
                step="0.1"
                value={consumption}
                onChange={(e) => setConsumption(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                placeholder="Ton/Día"
              />
              {consumption && !isNaN(Number(consumption)) && (
                <span className="text-[10px] text-slate-400 font-mono block mt-1">
                  Consumo Neto (incluye 5% de margen por mal tiempo): {(Number(consumption) * 1.05).toFixed(2)} t/d
                </span>
              )}
            </div>
          </div>

          <div className="pt-2 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleGuardar}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-3 rounded transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Guardar / Save
            </button>
            <button
              type="button"
              onClick={handleFinishAudit}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded transition flex items-center justify-center gap-1.5 shadow-lg shadow-blue-950/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Finish Audit
            </button>
          </div>
        </div>

        {/* Database List Display */}
        <div className="md:col-span-2 bg-slate-950/30 border border-slate-800 rounded-lg p-4 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2 mb-3 flex items-center justify-between">
            <span>Buques Guardados / Saved Fleet</span>
            <span className="text-[10px] font-mono text-slate-600 font-semibold">{savedVessels.length} buques</span>
          </h3>

          <div className="flex-1 overflow-x-auto">
            {savedVessels.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-12 text-center text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 stroke-current" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v4" />
                </svg>
                <p className="text-xs font-semibold">Biblioteca de buques vacía.</p>
                <p className="text-[10px] text-slate-700 max-w-xs mt-1">Busque especificaciones de un buque por su nombre usando la extracción con IA o ingréselas manualmente.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-800/80">
                    <th className="py-2.5 px-3 font-semibold">Nombre</th>
                    <th className="py-2.5 px-3 font-semibold text-right">DWT</th>
                    <th className="py-2.5 px-3 font-semibold text-center">LOA</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Draft</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Vel.</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Cons.</th>
                    <th className="py-2.5 px-3 font-semibold text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {savedVessels.map((v, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40 transition-colors group">
                      <td className="py-2.5 px-3 font-bold text-white max-w-[120px] truncate">{v.vessel_name}</td>
                      <td className="py-2.5 px-3 text-right text-indigo-400 font-semibold">{(v.dwt || 0).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-center text-slate-400">{v.loa || '-'}</td>
                      <td className="py-2.5 px-3 text-center text-slate-400">{v.draft || '-'}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{v.spd_ballast || v.spd_laden || '-'} kt</td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{v.cons_sea || '-'} t/d</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleEliminar(idx)}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1 rounded transition-all"
                          title="Eliminar Buque"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
