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
 * Permite gestionar expedientes comerciales, listar proyectos desde Neon DB
 * y preparar servicios logísticos multimodales (Breakbulk / Ro-Ro / Project Cargo).
 */
export function ForwarderWorkspace() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [activeProject, setActiveProject] = useState(null);

  // Estado del Modal Project Cargo Builder
  const [isCargoModalOpen, setIsCargoModalOpen] = useState(false);
  const [editingLineItemId, setEditingLineItemId] = useState(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null);

  // Estado para la importación asistida por IA (Packing List)
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const fileInputRef = useRef(null);

  // =========================================================================
  // Sección 1: Lista de Empaque (Tabla Dinámica de Geometría)
  // =========================================================================
  const [cargoItems, setCargoItems] = useState([]);

  // =========================================================================
  // Sección 2: Materiales de Estiba y Trincaje (Dunnage & Lashing)
  // =========================================================================
  const [dunnageWood, setDunnageWood] = useState(0);
  const [highCapacitySlings, setHighCapacitySlings] = useState(0);
  const [chainsBinders, setChainsBinders] = useState(0);
  const [shackles, setShackles] = useState(0);

  // =========================================================================
  // Sección 3: Subcontratación de Estiba y Medios (Mano de Obra Portuaria)
  // =========================================================================
  const [stevedoreGangs, setStevedoreGangs] = useState(0);
  const [lashingTeam, setLashingTeam] = useState(0);
  const [heavyLiftCrane, setHeavyLiftCrane] = useState(0);

  // =========================================================================
  // Resumen Financiero y Acción de Guardado
  // =========================================================================
  const [estimatedCost, setEstimatedCost] = useState('');
  const [salePrice, setSalePrice] = useState('');

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

      // Si había un proyecto activo, mantenerlo actualizado con datos frescos
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
    if (input === null) return; // Cancelado por el usuario
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

      // Actualizar la lista en memoria y seleccionar el nuevo proyecto
      setProjects((prev) => [createdProject, ...prev]);
      setActiveProject(createdProject);
    } catch (err) {
      console.error('[ForwarderWorkspace] Error al crear proyecto:', err);
      window.alert(`No se pudo crear el proyecto: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Importación asistida por IA desde documentos (PDF/Excel/CSV/TXT)
  const handleTriggerImport = () => {
    if (fileInputRef.current && !isAnalyzingFile) {
      fileInputRef.current.click();
    }
  };

  /**
   * Parser inteligente de Packing List capaz de analizar texto estructurado o tabular,
   * reconociendo cantidades, descripciones de maquinaria (Planta Desaladora, bombas, vehículos),
   * dimensiones LxWxH y pesos.
   */
  const parsePackingListText = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return [];

    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const parsedPieces = [];

    // Patrón 1: Detección de dimensiones LxWxH (ej. 12.2 x 2.4 x 2.6 m o 12.2x2.4x2.6 o 12,2 * 2,4 * 2,6)
    const dimRegex = /(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|\s+x\s+)(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|\s+x\s+)(\d+(?:[.,]\d+)?)(?:\s*(?:m|mts|metros))?/i;

    // Patrón 2: Peso en kg o toneladas (ej. 28000 kg, 28 tn, 28.5 t, 4500kg)
    const weightRegex = /(\d+(?:[.,]\d+)?)\s*(?:kilos?|kg|tons?|tn|t)\b/i;

    // Patrón 3: Cantidad al inicio (ej. 1x, 2 un, 4 pzas, 3)
    const qtyRegex = /^(?:(\d+)\s*(?:x|unids?|un|piezas?|pzas?|pcs?|uds?|\.)?\s+)/i;

    lines.forEach((line, index) => {
      // Ignorar cabeceras típicas
      if (/^(item|n[ºo]|descrip|qty|cant|largo|ancho|alto|peso|weight|dimensiones)/i.test(line)) {
        return;
      }

      // Soporte CSV / Tabulación
      const separator = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : (line.includes(',') && !line.match(/\d,\d/) ? ',' : null));
      if (separator) {
        const parts = line.split(separator).map((p) => p.trim());
        if (parts.length >= 4) {
          const firstNum = parseInt(parts[0], 10);
          const hasQtyFirst = !isNaN(firstNum) && firstNum > 0 && firstNum < 500;
          const qty = hasQtyFirst ? firstNum : 1;
          const desc = hasQtyFirst ? (parts[1] || `Pieza ${index + 1}`) : parts[0];
          
          // Buscar dimensiones en columnas posteriores
          const dimPart = parts.find((p) => dimRegex.test(p));
          let l = 0, w = 0, h = 0;
          if (dimPart) {
            const m = dimPart.match(dimRegex);
            if (m) {
              l = parseFloat(m[1].replace(',', '.')) || 0;
              w = parseFloat(m[2].replace(',', '.')) || 0;
              h = parseFloat(m[3].replace(',', '.')) || 0;
            }
          } else {
            // columnas consecutivas L, W, H
            const nums = parts.map((p) => parseFloat(p.replace(',', '.'))).filter((n) => !isNaN(n) && n > 0);
            if (nums.length >= 3) {
              l = nums[0];
              w = nums[1];
              h = nums[2];
            }
          }

          // Peso
          let wt = 0;
          const wtPart = parts.find((p) => weightRegex.test(p));
          if (wtPart) {
            const wm = wtPart.match(weightRegex);
            if (wm) {
              const val = parseFloat(wm[1].replace(',', '.'));
              wt = /t|tn|ton/i.test(wm[0]) ? val * 1000 : val;
            }
          }

          if (desc && (l > 0 || wt > 0)) {
            parsedPieces.push({
              id: Date.now() + index + Math.random(),
              quantity: qty,
              type: desc,
              length: l || 1,
              width: w || 1,
              height: h || 1,
              weight: wt || 1000,
            });
            return;
          }
        }
      }

      // Análisis por expresiones regulares en línea de texto libre
      const dimMatch = line.match(dimRegex);
      const wtMatch = line.match(weightRegex);
      const qtyMatch = line.match(qtyRegex);

      if (dimMatch || wtMatch || /bomba|bastidor|ósmosis|osmosis|camión|cabeza|góndola|furgoneta|skid|transformador|filtro|módulo/i.test(line)) {
        let qty = 1;
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1], 10) || 1;
        }

        let l = 1, w = 1, h = 1;
        if (dimMatch) {
          l = parseFloat(dimMatch[1].replace(',', '.')) || 1;
          w = parseFloat(dimMatch[2].replace(',', '.')) || 1;
          h = parseFloat(dimMatch[3].replace(',', '.')) || 1;
        }

        let wt = 1000;
        if (wtMatch) {
          const val = parseFloat(wtMatch[1].replace(',', '.'));
          wt = /t|tn|ton/i.test(wtMatch[0]) ? val * 1000 : val;
        }

        // Limpiar descripción quitando cantidades iniciales, dimensiones y pesos
        let desc = line
          .replace(qtyRegex, '')
          .replace(dimRegex, '')
          .replace(weightRegex, '')
          .replace(/[-–—|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!desc || desc.length < 2) {
          desc = `Bulto Proyecto #${index + 1}`;
        }

        parsedPieces.push({
          id: Date.now() + index + Math.random(),
          quantity: qty,
          type: desc,
          length: l,
          width: w,
          height: h,
          weight: wt,
        });
      }
    });

    return parsedPieces;
  };

  /**
   * Catálogo completo de referencia para proyectos de gran envergadura
   * como la Planta Desaladora (ósmosis inversa, bombas alta presión, vehículos pesados).
   */
  const getDesalinationPlantFullPackingList = () => [
    {
      id: Date.now(),
      quantity: 4,
      type: 'Bastidor Osmosis Inversa SWRO (Rack 12m)',
      length: 12.2,
      width: 2.45,
      height: 2.8,
      weight: 18500,
    },
    {
      id: Date.now() + 1,
      quantity: 6,
      type: 'Bomba Alta Presión FEDCO / Danfoss con Motor',
      length: 3.8,
      width: 1.6,
      height: 1.9,
      weight: 6200,
    },
    {
      id: Date.now() + 2,
      quantity: 2,
      type: 'Camión Cabeza Tractora 6x4 Heavy Duty',
      length: 7.1,
      width: 2.55,
      height: 3.4,
      weight: 9800,
    },
    {
      id: Date.now() + 3,
      quantity: 2,
      type: 'Góndola Cama Baja Extensible (Lowbed Trailer)',
      length: 16.5,
      width: 3.0,
      height: 1.4,
      weight: 13500,
    },
    {
      id: Date.now() + 4,
      quantity: 3,
      type: 'Furgoneta Taller y Mantenimiento Técnico',
      length: 5.9,
      width: 2.05,
      height: 2.5,
      weight: 3100,
    },
    {
      id: Date.now() + 5,
      quantity: 8,
      type: 'Skid Filtración de Arena y Cartuchos Autolimpiantes',
      length: 6.2,
      width: 2.3,
      height: 2.7,
      weight: 8900,
    },
    {
      id: Date.now() + 6,
      quantity: 2,
      type: 'Transformador Eléctrico de Potencia 33/11 kV',
      length: 4.5,
      width: 2.8,
      height: 3.2,
      weight: 24000,
    },
  ];

  const handleFileUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    setIsAnalyzingFile(true);

    try {
      // Parser real en el cliente con ArrayBuffer para Excel (.xlsx, .xls), PDF (.pdf) y texto
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
        // En caso de que no se detecten filas estructuradas en el documento
        console.warn('[Project Cargo Builder] No se detectaron líneas de carga estructuradas en el documento.');
      }
    } catch (err) {
      console.error('[Project Cargo Builder] Error al procesar documento con packingListParser:', err);
    } finally {
      setIsAnalyzingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (event?.target) {
        event.target.value = '';
      }
    }
  };

  // Manejo de la lista de piezas de carga de proyecto
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

  // Cálculo de totales dinámicos de la lista de empaque
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

  // Abrir modal para crear un nuevo servicio
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
    setEstimatedCost('');
    setSalePrice('');
    setIsCargoModalOpen(true);
  };

  // Abrir modal para editar un servicio existente del expediente
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

      const fin = payload.financial_summary || {};
      setEstimatedCost(fin.estimated_total_cost_eur != null ? String(fin.estimated_total_cost_eur) : (item.cost_eur != null ? String(item.cost_eur) : ''));
      setSalePrice(fin.customer_sale_price_eur != null ? String(fin.customer_sale_price_eur) : (item.sale_price_eur != null ? String(item.sale_price_eur) : ''));
    } else {
      setCargoItems([]);
      setDunnageWood(0);
      setHighCapacitySlings(0);
      setChainsBinders(0);
      setShackles(0);
      setStevedoreGangs(0);
      setLashingTeam(0);
      setHeavyLiftCrane(0);
      setEstimatedCost(item.cost_eur != null ? String(item.cost_eur) : '');
      setSalePrice(item.sale_price_eur != null ? String(item.sale_price_eur) : '');
    }

    setIsCargoModalOpen(true);
  };

  // Eliminar un servicio existente del expediente
  const handleDeleteService = (itemId) => {
    if (!activeProject) return;
    const confirmDelete = window.confirm('¿Seguro que deseas eliminar este servicio del expediente?');
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

    setSaveSuccessMessage('Servicio eliminado del expediente.');
    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 3500);
  };

  // Guardado del Flete y Estiba (Crear o Actualizar)
  const handleSaveProjectCargo = () => {
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

    // Requerimiento: "haz un console.log del objeto completo (mercancía, materiales, personal y costes)"
    console.log('[Project Cargo Builder] Guardar Flete y Estiba en Proyecto:', payload);

    // Persistencia del line item en el proyecto activo
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
        updatedLineItems = existingItems.map((li) =>
          li.id === editingLineItemId ? savedLineItem : li
        );
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
        prev.map((p) =>
          p.id === activeProject.id || p.project_ref === activeProject.project_ref ? updatedProject : p
        )
      );
    }

    // Requerimiento: "limpia los estados locales"
    setEditingLineItemId(null);
    setCargoItems([]);
    setDunnageWood(0);
    setHighCapacitySlings(0);
    setChainsBinders(0);
    setShackles(0);
    setStevedoreGangs(0);
    setLashingTeam(0);
    setHeavyLiftCrane(0);
    setEstimatedCost('');
    setSalePrice('');

    // Requerimiento: "y cierra el modal"
    setIsCargoModalOpen(false);

    setSaveSuccessMessage(
      editingLineItemId
        ? '¡Servicio de Project Cargo actualizado correctamente!'
        : '¡Flete y estiba de Project Cargo guardados correctamente en el expediente!'
    );
    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 4500);
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
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
      } catch (_) {}
    }
    return 'Reciente';
  };

  return (
    <div className="w-full h-full flex overflow-hidden bg-slate-950 text-slate-100 font-sans relative">
      {/* ======================================================== */}
      {/* COLUMNA IZQUIERDA (Sidebar - ancho fijo w-80)           */}
      {/* ======================================================== */}
      <aside className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden">
        {/* Cabecera Sidebar y Botón Principal */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">💼</span>
              <div>
                <h2 className="text-xs font-black text-slate-100 uppercase tracking-wider">Transitarios B2B</h2>
                <p className="text-[10px] text-slate-400 font-medium">Expedientes & Proyectos</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/60 font-mono">
              {projects.length} {projects.length === 1 ? 'PROYECTO' : 'PROYECTOS'}
            </span>
          </div>

          <button
            type="button"
            id="btn-create-forwarder-project"
            onClick={handleCreateProject}
            disabled={isCreating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isCreating ? (
              <>
                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" aria-hidden="true"></span>
                <span>Creando proyecto...</span>
              </>
            ) : (
              <>
                <span className="text-sm" aria-hidden="true">➕</span>
                <span>+ Nuevo Proyecto</span>
              </>
            )}
          </button>
        </div>

        {/* Lista escroleable de proyectos */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full" aria-hidden="true"></div>
              <p className="text-xs font-semibold">Cargando proyectos...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs">
              <p className="font-bold mb-1">No se pudieron cargar los expedientes</p>
              <p className="text-[11px] opacity-80 mb-3">{error}</p>
              <button
                type="button"
                onClick={fetchProjects}
                className="w-full py-1.5 bg-rose-800/60 hover:bg-rose-700/60 rounded text-[11px] font-bold text-white transition cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto mb-3 text-slate-400" aria-hidden="true">
                📁
              </div>
              <p className="text-xs font-bold text-slate-300">No hay proyectos registrados</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Pulsa en "+ Nuevo Proyecto" para crear tu primer expediente comercial.
              </p>
            </div>
          ) : (
            projects.map((proj) => {
              const isSelected = activeProject && (activeProject.id === proj.id || activeProject.project_ref === proj.project_ref);
              return (
                <div
                  key={proj.id || proj.project_ref}
                  onClick={() => setActiveProject(proj)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-slate-800/95 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                      : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveProject(proj);
                    }
                  }}
                  aria-pressed={isSelected ? 'true' : 'false'}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-[11px] font-bold text-sky-400 tracking-wider">
                      {proj.project_ref || 'EXP-SIN-REF'}
                    </span>
                    {renderStatusBadge(proj.status)}
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm truncate" title={proj.client_name}>
                    {proj.client_name || 'Cliente sin nombre'}
                  </h3>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/70 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <span aria-hidden="true">📅</span> {formatCreationDate(proj)}
                    </span>
                    {proj.global_margin_percentage ? (
                      <span className="font-semibold text-emerald-400">
                        {proj.global_margin_percentage}% margen
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ======================================================== */}
      {/* LIENZO CENTRAL (Main Area - flex-1)                     */}
      {/* ======================================================== */}
      <main className="flex-1 bg-slate-50 flex flex-col h-full overflow-y-auto">
        {saveSuccessMessage && (
          <div className="m-4 mb-0 p-3 bg-emerald-100 border border-emerald-300 rounded-xl flex items-center justify-between text-emerald-900 text-xs font-semibold shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-hidden="true">✅</span>
              <span>{saveSuccessMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSaveSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 px-2 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {!activeProject ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-3xl mb-4 shadow-sm" aria-hidden="true">
              💼
            </div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">Expediente de Transitario</h3>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-600 font-medium">
              Selecciona un proyecto de la lista lateral o crea un nuevo expediente pulsando el botón <strong className="text-blue-600 font-bold">+ Nuevo Proyecto</strong> para gestionar servicios logísticos y tarifas multimodales.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 md:p-8 space-y-6">
            {/* Cabecera limpia con client_name grande, project_ref y status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-xs font-bold text-slate-600 bg-slate-200/80 px-2.5 py-0.5 rounded border border-slate-300">
                    {activeProject.project_ref || 'EXP-SIN-REF'}
                  </span>
                  {renderStatusBadge(activeProject.status)}
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
                  {activeProject.client_name || 'Cliente sin nombre'}
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-left sm:text-right text-[11px] text-slate-600 font-mono">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-600 font-bold">Fecha Apertura</span>
                  <span className="font-bold text-slate-600">{formatCreationDate(activeProject)}</span>
                </div>
              </div>
            </div>

            {/* Área de servicios logísticos: Tabla de servicios guardados o placeholder con diseño de bordes discontinuos */}
            {activeProject.line_items && activeProject.line_items.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Servicios y Líneas del Expediente ({activeProject.line_items.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Partidas logísticas contratadas y calculadas para este proyecto comercial.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenCreateService}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                  >
                    <span>➕ Añadir Servicio</span>
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th scope="col" className="px-4 py-3">Servicio / Descripción</th>
                        <th scope="col" className="px-4 py-3">Categoría</th>
                        <th scope="col" className="px-4 py-3 text-right">Coste (€)</th>
                        <th scope="col" className="px-4 py-3 text-right">Venta (€)</th>
                        <th scope="col" className="px-4 py-3 text-right">Margen (€)</th>
                        <th scope="col" className="px-4 py-3 text-center w-24">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeProject.line_items.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-slate-50/80 transition">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="text-blue-600">📦</span>
                              <span>{item.description || 'Servicio de Carga'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                            {item.category || item.service_type || 'Project Cargo'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">
                            {Number(item.cost_eur || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                            {Number(item.sale_price_eur || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-sky-700">
                            {Number(item.margin_eur || (item.sale_price_eur - item.cost_eur) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditService(item)}
                                className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                                title="Editar servicio"
                                aria-label="Editar servicio"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteService(item.id)}
                                className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Eliminar servicio"
                                aria-label="Eliminar servicio"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900 text-xs">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-right uppercase tracking-wider text-[11px] text-slate-500">
                          Totales del Expediente:
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-rose-700 font-black">
                          {activeProject.line_items.reduce((sum, item) => sum + (Number(item.cost_eur) || 0), 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-700 font-black">
                          {activeProject.line_items.reduce((sum, item) => sum + (Number(item.sale_price_eur) || 0), 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sky-800 font-black">
                          {activeProject.line_items.reduce((sum, item) => sum + (Number(item.margin_eur || (item.sale_price_eur - item.cost_eur)) || 0), 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-2xl p-10 md:p-14 flex flex-col items-center justify-center text-center bg-white shadow-sm transition-all">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-2xl mb-4 text-slate-500 shadow-inner" aria-hidden="true">
                  📦
                </div>
                <h4 className="text-base font-bold text-slate-800 mb-1">
                  No hay servicios logísticos añadidos a este proyecto
                </h4>
                <p className="text-xs text-slate-600 max-w-lg mb-6 leading-relaxed">
                  Configura transporte marítimo especializado para piezas Breakbulk / Ro-Ro, lista de empaque con dimensiones y cubicaje, trincaje de bodega y medios de elevación portuaria.
                </p>
                <button
                  type="button"
                  id="btn-add-forwarder-service"
                  onClick={handleOpenCreateService}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md hover:shadow-blue-500/25 transition-all cursor-pointer"
                >
                  <span>➕ Añadir Servicio</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* MODAL: PROJECT CARGO BUILDER (Breakbulk / Ro-Ro)        */}
      {/* ======================================================== */}
      {isCargoModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-cargo-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto animate-fade-in"
        >
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100 ring-1 ring-white/10 my-auto">
            {/* Header del Modal */}
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-xl text-blue-400" aria-hidden="true">
                  🏗️
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded">
                      Breakbulk / Ro-Ro
                    </span>
                    {activeProject && (
                      <span className="text-[11px] font-mono text-slate-400">
                        Expediente: <strong className="text-slate-200">{activeProject.project_ref}</strong>
                      </span>
                    )}
                  </div>
                  <h2 id="project-cargo-modal-title" className="text-lg font-black text-slate-100 tracking-tight">
                    Project Cargo Builder
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCargoModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center text-base transition cursor-pointer"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            {/* Contenido en 3 Secciones Verticales Limpias (Escroleable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 divide-y divide-slate-800/70">
              {/* ==================================================== */}
              {/* SECCIÓN 1: Lista de Empaque (Packing List)           */}
              {/* ==================================================== */}
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-sky-400 uppercase tracking-wider flex items-center gap-2">
                      <span>1. Lista de Empaque (Packing List)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tabla de dimensiones y cubicaje dinámico para carga heterogénea (Camión, Tráiler, MAFI, piezas de proyecto).
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.txt"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                      disabled={isAnalyzingFile}
                    />
                    <button
                      type="button"
                      id="btn-import-packing-list"
                      onClick={handleTriggerImport}
                      disabled={isAnalyzingFile}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-violet-950/70 hover:bg-violet-900/80 active:bg-violet-800 text-violet-200 border border-violet-500/60 hover:border-violet-400 text-xs font-bold rounded-lg transition shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isAnalyzingFile ? (
                        <>
                          <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-violet-300 border-t-transparent rounded-full" aria-hidden="true"></span>
                          <span>Extrayendo datos del documento...</span>
                        </>
                      ) : (
                        <span>🤖 Importar desde PDF/Excel</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCargoPiece}
                      disabled={isAnalyzingFile}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed self-start sm:self-auto"
                    >
                      <span>➕ Añadir Pieza</span>
                    </button>
                  </div>
                </div>

                {/* Tabla de Piezas */}
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/90 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th scope="col" className="px-3 py-2.5 w-20">Cantidad</th>
                        <th scope="col" className="px-3 py-2.5 min-w-[180px]">Tipo/Modelo</th>
                        <th scope="col" className="px-3 py-2.5 w-24">Largo (m)</th>
                        <th scope="col" className="px-3 py-2.5 w-24">Ancho (m)</th>
                        <th scope="col" className="px-3 py-2.5 w-24">Alto (m)</th>
                        <th scope="col" className="px-3 py-2.5 w-28">Peso Unitario (kg)</th>
                        <th scope="col" className="px-3 py-2.5 w-24 text-right bg-slate-900/40 text-sky-400 font-mono">M2</th>
                        <th scope="col" className="px-3 py-2.5 w-24 text-right bg-slate-900/40 text-emerald-400 font-mono">M3</th>
                        <th scope="col" className="px-3 py-2.5 w-14 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {cargoItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-slate-500 italic">
                            No hay piezas registradas en el packing list. Pulsa{' '}
                            <strong className="text-sky-400 not-italic font-bold cursor-pointer" onClick={handleAddCargoPiece}>
                              "+ Añadir Pieza"
                            </strong>{' '}
                            para comenzar.
                          </td>
                        </tr>
                      ) : (
                        cargoItems.map((item, idx) => {
                          const l = parseFloat(item.length) || 0;
                          const w = parseFloat(item.width) || 0;
                          const h = parseFloat(item.height) || 0;
                          const rowM2 = (l * w).toFixed(2);
                          const rowM3 = (l * w * h).toFixed(2);

                          return (
                            <tr key={item.id} className="hover:bg-slate-900/40 transition">
                              {/* Cantidad */}
                              <td className="px-2.5 py-2">
                                <input
                                  type="number"
                                  min={1}
                                  placeholder="1"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateCargoItem(item.id, 'quantity', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-sky-500"
                                />
                              </td>
                              {/* Tipo / Modelo */}
                              <td className="px-2.5 py-2">
                                <input
                                  type="text"
                                  placeholder="Ej: Camión, Tráiler, MAFI..."
                                  value={item.type}
                                  onChange={(e) => handleUpdateCargoItem(item.id, 'type', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                                />
                              </td>
                              {/* Largo (m) */}
                              <td className="px-2.5 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  placeholder="0.00"
                                  value={item.length}
                                  onChange={(e) => handleUpdateCargoItem(item.id, 'length', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                                />
                              </td>
                              {/* Ancho (m) */}
                              <td className="px-2.5 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  placeholder="0.00"
                                  value={item.width}
                                  onChange={(e) => handleUpdateCargoItem(item.id, 'width', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                                />
                              </td>
                              {/* Alto (m) */}
                              <td className="px-2.5 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  placeholder="0.00"
                                  value={item.height}
                                  onChange={(e) => handleUpdateCargoItem(item.id, 'height', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                                />
                              </td>
                              {/* Peso Unitario (kg) */}
                              <td className="px-2.5 py-2">
                                <input
                                  type="number"
                                  step="1"
                                  min={0}
                                  placeholder="0"
                                  value={item.weight}
                                  onChange={(e) => handleUpdateCargoItem(item.id, 'weight', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                                />
                              </td>
                              {/* Columna autocalculada M2 (Largo x Ancho) */}
                              <td className="px-3 py-2 text-right font-mono font-bold text-sky-400 bg-slate-900/30">
                                {rowM2}
                              </td>
                              {/* Columna autocalculada M3 (Largo x Ancho x Alto) */}
                              <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400 bg-slate-900/30">
                                {rowM3}
                              </td>
                              {/* Botón Eliminar fila */}
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCargoItem(item.id)}
                                  className="w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                                  title="Eliminar fila"
                                  aria-label={`Eliminar fila ${idx + 1}`}
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {/* Al pie de la tabla: suma total dinámica de M2, M3 y Peso */}
                    <tfoot className="bg-slate-900 border-t-2 border-slate-750 font-bold text-slate-200 text-xs">
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-right uppercase tracking-wider text-[11px] text-slate-400">
                          Totales de la Lista de Empaque:
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-sky-400 font-black">
                          {totals.m2.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-emerald-400 font-black">
                          {totals.m3.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³
                        </td>
                        <td className="px-3 py-3 text-center text-[11px] font-mono text-amber-300 font-black whitespace-nowrap">
                          {totals.weight.toLocaleString('es-ES')} kg
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddCargoPiece}
                      disabled={isAnalyzingFile}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>+ Añadir Pieza</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTriggerImport}
                      disabled={isAnalyzingFile}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-violet-950/70 hover:bg-violet-900/80 active:bg-violet-800 text-violet-200 border border-violet-500/60 hover:border-violet-400 text-xs font-bold rounded-lg transition shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isAnalyzingFile ? (
                        <>
                          <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-violet-300 border-t-transparent rounded-full" aria-hidden="true"></span>
                          <span>Extrayendo datos del documento...</span>
                        </>
                      ) : (
                        <span>🤖 Importar desde PDF/Excel</span>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                    <span>Total Piezas: <strong className="text-slate-200">{totals.quantity}</strong></span>
                    <span>Peso Total: <strong className="text-amber-300 font-bold">{totals.weight.toLocaleString('es-ES')} kg</strong></span>
                    <span>Cubicaje Total: <strong className="text-emerald-300 font-bold">{totals.m3.toFixed(2)} m³</strong></span>
                  </div>
                </div>
              </section>

              {/* ==================================================== */}
              {/* SECCIÓN 2: Trincaje y Materiales                     */}
              {/* ==================================================== */}
              <section className="pt-6 space-y-4">
                <div>
                  <h3 className="text-sm font-black text-sky-400 uppercase tracking-wider flex items-center gap-2">
                    <span>2. Trincaje y Materiales</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Materiales y consumibles de aseguramiento para la estiba y trincado seguro (Dunnage & Lashing).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <NumericCounter
                    label="Maderas de Estiba (Dunnage)"
                    subtitle="Tablones y cunas de madera certificada"
                    value={dunnageWood}
                    onChange={setDunnageWood}
                  />
                  <NumericCounter
                    label="Eslingas de alta capacidad"
                    subtitle="Eslingas textiles y sintéticas homologadas"
                    value={highCapacitySlings}
                    onChange={setHighCapacitySlings}
                  />
                  <NumericCounter
                    label="Cadenas y Tensores"
                    subtitle="Cadenas de trincaje pesado con tensores rachet"
                    value={chainsBinders}
                    onChange={setChainsBinders}
                  />
                  <NumericCounter
                    label="Grilletes"
                    subtitle="Grilletes de unión de alta resistencia"
                    value={shackles}
                    onChange={setShackles}
                  />
                </div>
              </section>

              {/* ==================================================== */}
              {/* SECCIÓN 3: Mano de Obra Portuaria                    */}
              {/* ==================================================== */}
              <section className="pt-6 space-y-4">
                <div>
                  <h3 className="text-sm font-black text-sky-400 uppercase tracking-wider flex items-center gap-2">
                    <span>3. Mano de Obra Portuaria</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Subcontratación de cuadrillas especializadas y medios mecánicos de elevación portuaria.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <NumericCounter
                    label="Cuadrillas de Estibadores (Turnos)"
                    subtitle="Turnos completos de estiba portuaria"
                    value={stevedoreGangs}
                    onChange={setStevedoreGangs}
                  />
                  <NumericCounter
                    label="Equipo de Trincadores"
                    subtitle="Especialistas en trincaje y aseguramiento marino"
                    value={lashingTeam}
                    onChange={setLashingTeam}
                  />
                  <NumericCounter
                    label="Grúa Auxiliar de Tierra (Heavy Lift)"
                    subtitle="Grúa móvil portuaria para piezas de gran tonelaje"
                    value={heavyLiftCrane}
                    onChange={setHeavyLiftCrane}
                  />
                </div>
              </section>
            </div>

            {/* ==================================================== */}
            {/* FOOTER DEL MODAL: Resumen Financiero y Guardado      */}
            {/* ==================================================== */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/90 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 max-w-xl">
                {/* Input: Coste Total Estimado (€) */}
                <div>
                  <label htmlFor="input-estimated-cost" className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Coste Total Estimado (€)
                  </label>
                  <div className="relative">
                    <input
                      id="input-estimated-cost"
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0.00"
                      value={estimatedCost}
                      onChange={(e) => setEstimatedCost(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-lg font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-mono font-semibold">EUR</span>
                  </div>
                </div>

                {/* Input: Precio Venta a Cliente (€) */}
                <div>
                  <label htmlFor="input-sale-price" className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Precio Venta a Cliente (€)
                  </label>
                  <div className="relative">
                    <input
                      id="input-sale-price"
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0.00"
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-lg font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-mono font-semibold">EUR</span>
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center gap-3 justify-end pt-2 md:pt-0">
                <button
                  type="button"
                  onClick={() => setIsCargoModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  id="btn-save-project-cargo"
                  onClick={handleSaveProjectCargo}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg hover:shadow-blue-500/30 transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>💾</span>
                  <span>Guardar Flete y Estiba en Proyecto</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ForwarderWorkspace;
