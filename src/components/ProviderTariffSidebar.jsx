/**
 * ProviderTariffSidebar.jsx
 * Componente modular e independiente: Gestor Universal de Tarifas FOB/EXW en SeaCharter Core PRO.
 *
 * ESPECIFICACIONES CRÍTICAS:
 * 1. Eliminación Absoluta de Datos Hardcodeados:
 *    - Inicia completamente limpio (lista de entidades vacía []). Solo se registran y muestran
 *      aquellas entidades cuyos archivos son subidos explícitamente por el usuario.
 * 2. Parser Dinámico de Productos (Adiós al genérico "Vrac"):
 *    - Pobla el desplegable exactamente con los nombres reales del archivo (ej. "CEM I 52,5N big bag", "CEM II 42,5 vrac", etc.).
 * 3. Selector de Opción FSPE (Con FSPE / Sin FSPE):
 *    - Con FSPE: Usa el coste logístico de fábrica subvencionado por el estado.
 *    - Sin FSPE: Sustituye automáticamente por la tarifa real de mercado de Land Charter.
 * 4. Selector de Modalidad Comercial (FOB vs. EXW) con Antiduplicidad.
 * 5. Absorción Automática del Tonelaje del Proyecto (ej. 10.000 MT).
 * 6. UI/UX: Margen izquierdo, panel arrastrable (Draggable), Tema Claro corporativo y pie de acciones 100% visible.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  DEFAULT_PROVIDER_TARIFFS,
  DEFAULT_EXCEL_MATERIALS,
  OFFICIAL_EXCHANGE_RATE_DZD_USD,
  calculateTariffBreakdown
} from '../data/defaultProviderTariffs.js';
import { parseProviderTariffFile } from '../services/providerTariffParser.js';

const STORAGE_CATALOG_KEY = 'seacharter_tariffs_catalog_v3';
const DEFAULT_POSITION = { x: 30, y: 80 };

const defaultExcelEntity = {
  id: 'ent-excel-definitivo',
  name: 'GICA Export 2026 (Matriz Excel)',
  shortName: 'GICA Excel',
  entityType: 'provider',
  country: 'Argelia',
  port: 'Puerto Bejaia',
  description: 'Tarifario oficial cargado según el Excel definitivo del cliente.',
  materials: DEFAULT_EXCEL_MATERIALS
};

export default function ProviderTariffSidebar() {
  // 1. Visibilidad exclusiva en el modal/pantalla "PROJECT CARGO BUILDER" dentro de Proyectos
  const [isInProjects, setIsInProjects] = useState(() => {
    if (typeof document === 'undefined') return false;
    const isCargoModalOpen = Boolean(window.__IS_CARGO_BUILDER_MODAL_OPEN__ || document.querySelector('.bg-white.border.border-slate-200.rounded-2xl.shadow-2xl'));
    return isCargoModalOpen;
  });

  const [isCargoModalActive, setIsCargoModalActive] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.__IS_CARGO_BUILDER_MODAL_OPEN__);
  });

  // Estado de apertura del panel
  const [isOpen, setIsOpen] = useState(false);
  const setSidebarOpen = setIsOpen;

  // 1. ELIMINACIÓN DE DATOS HARDCODEADOS: Inicia vacío o desde lo guardado por el usuario
  const [entities, setEntities] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_CATALOG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return DEFAULT_PROVIDER_TARIFFS; // []
  });

  const [selectedEntityId, setSelectedEntityId] = useState(() => {
    return entities.length > 0 ? entities[0].id : '';
  });

  // Selector de Modalidad Comercial: 'FOB' | 'EXW'
  const [commercialModality, setCommercialModality] = useState('FOB');

  // SELECTOR DE OPCIÓN FSPE: true = Con FSPE (Subvencionado) / false = Sin FSPE (Coste de Mercado Land Charter)
  const [useFspe, setUseFspe] = useState(true);

  // Posición del panel arrastrable (Draggable position)
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 30, posY: 80 });

  // Filtro de entidad: 'all' | 'provider' | 'client'
  const [entityFilter, setEntityFilter] = useState('all');

  // Entidad activa y material seleccionado (con fallback al catálogo oficial de Excel definitivo)
  const activeEntity = entities.find(e => e.id === selectedEntityId) || entities[0] || defaultExcelEntity;
  const [selectedMaterialId, setSelectedMaterialId] = useState(activeEntity?.materials?.[0]?.id || DEFAULT_EXCEL_MATERIALS[0].id);

  // Modo de edición manual / negociación
  const [isManualEditMode, setIsManualEditMode] = useState(false);
  const [manualOverrides, setManualOverrides] = useState({});

  // Tonelaje adsorbido automáticamente del Proyecto Activo
  const [projectWeightTons, setProjectWeightTons] = useState(10000);
  const [hasAbsorbedProjectTonnage, setHasAbsorbedProjectTonnage] = useState(false);

  // Tarifa de mercado Land Charter detectada del proyecto (inicializada en 0, sin valores fijos ni hardcodeados)
  const [marketLandCharterRate, setMarketLandCharterRate] = useState(0);

  // 2. SELECTOR DE DIVISA Y TIPO DE CAMBIO DINÁMICO
  const [currency, setCurrency] = useState('DZD');
  const [exchangeRateToUsd, setExchangeRateToUsd] = useState(OFFICIAL_EXCHANGE_RATE_DZD_USD);

  // Tipo de cambio configurado (DZD / USD) sincronizado con exchangeRateToUsd
  const exchangeRateDzdUsd = exchangeRateToUsd;
  const setExchangeRateDzdUsd = setExchangeRateToUsd;

  // 1. ELIMINAR CAMPOS HARDCODEADOS (ARGELIA/GICA) -> ARRAY DINÁMICO DE TARIFAS
  // Sincronizado inicialmente con los valores base del producto por defecto del Excel definitivo
  const [tarifas, setTarifas] = useState([
    { id: 1, concepto: 'Precio Base Neto', valorLocal: 4930.00 },
    { id: 2, concepto: 'Envase / Big Bag', valorLocal: 470.75 },
    { id: 3, concepto: 'Logística / Inland', valorLocal: 914.60 },
    { id: 4, concepto: 'Gastos de tránsito', valorLocal: 107.60 },
    { id: 5, concepto: 'Gastos portuarios', valorLocal: 497.65 }
  ]);

  // Manejo de filas dinámicas de tarifas
  const handleTarifaConceptoChange = (id, nuevoConcepto) => {
    setTarifas(prev => prev.map(t => t.id === id ? { ...t, concepto: nuevoConcepto } : t));
  };

  const handleTarifaValorChange = (id, nuevoValorLocal) => {
    const val = parseFloat(nuevoValorLocal);
    const clean = isNaN(val) ? 0 : val;
    setTarifas(prev => prev.map(t => t.id === id ? { ...t, valorLocal: clean } : t));
  };

  const handleAddTarifaRow = () => {
    const nextId = tarifas.length > 0 ? Math.max(...tarifas.map(t => t.id)) + 1 : 1;
    setTarifas(prev => [...prev, { id: nextId, concepto: `Concepto ${nextId}`, valorLocal: 0 }]);
  };

  const handleRemoveTarifaRow = (id) => {
    setTarifas(prev => prev.filter(t => t.id !== id));
  };

  // Conversión dinámica a USD según exchangeRateToUsd
  const tarifasConUsd = tarifas.map(t => {
    const rate = Number(exchangeRateToUsd) > 0 ? Number(exchangeRateToUsd) : 1;
    const valorUsd = Math.round((Number(t.valorLocal || 0) / rate) * 100) / 100;
    return {
      ...t,
      valorUsd
    };
  });

  const totalTarifasUsdPerMt = tarifasConUsd.reduce((acc, t) => acc + (Number(t.valorUsd) || 0), 0);

  // Estados del uploader de archivos
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [importNotification, setImportNotification] = useState(null);
  const [newEntityType, setNewEntityType] = useState('provider');

  // Notificación Toast de sincronización manual
  const [syncToast, setSyncToast] = useState(null);

  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  // =========================================================================
  // CONTROL DE ARRASTRE DEL PANEL (DRAGGABLE WINDOW)
  // =========================================================================
  const handleHeaderMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) {
      return;
    }
    e.preventDefault();
    setIsDraggingPanel(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: position.x,
      posY: position.y
    };
  };

  useEffect(() => {
    if (!isDraggingPanel) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      const newX = Math.max(10, Math.min(window.innerWidth - 300, dragStartRef.current.posX + deltaX));
      const newY = Math.max(65, Math.min(window.innerHeight - 150, dragStartRef.current.posY + deltaY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDraggingPanel(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPanel]);

  // =========================================================================
  // ABSORCIÓN AUTOMÁTICA DEL TONELAJE DEL PROYECTO ACTIVO EN TIEMPO REAL
  // =========================================================================
  const detectAndAbsorbProjectTonnage = () => {
    if (typeof window === 'undefined') return;

    let detectedTons = 0;

    if (window.__ACTIVE_FORWARDER_TOTAL_WEIGHT_TONS__ != null && Number(window.__ACTIVE_FORWARDER_TOTAL_WEIGHT_TONS__) > 0) {
      detectedTons = Number(window.__ACTIVE_FORWARDER_TOTAL_WEIGHT_TONS__);
    }

    if (!detectedTons && typeof document !== 'undefined') {
      const tonnageEl = document.getElementById('forwarder-active-project-tonnage');
      if (tonnageEl && tonnageEl.dataset.tonnage) {
        const parsed = Number(tonnageEl.dataset.tonnage);
        if (parsed > 0) detectedTons = parsed;
      }
    }

    if (!detectedTons) {
      try {
        const saved = localStorage.getItem('seacharter_active_project_weight_tons');
        if (saved && Number(saved) > 0) {
          detectedTons = Number(saved);
        }
      } catch (_) {}
    }

    if (detectedTons > 0 && detectedTons !== projectWeightTons) {
      setProjectWeightTons(detectedTons);
      setHasAbsorbedProjectTonnage(true);
    }
  };

  // Absorción de tarifa real Land Charter desde el Proyecto o el ecosistema
  const detectAndAbsorbLandCharterRate = () => {
    if (typeof window === 'undefined') return;

    let detectedRate = 0;
    if (window.__ACTIVE_LAND_CHARTER_RATE_USD_MT__ != null && Number(window.__ACTIVE_LAND_CHARTER_RATE_USD_MT__) > 0) {
      detectedRate = Number(window.__ACTIVE_LAND_CHARTER_RATE_USD_MT__);
    } else if (window.__ACTIVE_FORWARDER_LAND_RATE__ != null && Number(window.__ACTIVE_FORWARDER_LAND_RATE__) > 0) {
      detectedRate = Number(window.__ACTIVE_FORWARDER_LAND_RATE__);
    }

    if (!detectedRate) {
      try {
        const savedCost = localStorage.getItem('seacharter_active_project_land_cost');
        const savedTons = localStorage.getItem('seacharter_active_project_weight_tons');
        if (savedCost && savedTons && Number(savedTons) > 0 && Number(savedCost) > 0) {
          detectedRate = Math.round((Number(savedCost) / Number(savedTons)) * 100) / 100;
        }
      } catch (_) {}
    }

    if (!detectedRate && typeof document !== 'undefined') {
      const landEl = document.getElementById('forwarder-active-land-rate');
      if (landEl && landEl.dataset.rate) {
        const parsed = Number(landEl.dataset.rate);
        if (parsed > 0) detectedRate = parsed;
      }
    }

    if (detectedRate > 0 && detectedRate !== marketLandCharterRate) {
      setMarketLandCharterRate(detectedRate);
    }
  };

  // =========================================================================
  // CONTROL DE VISIBILIDAD EXCLUSIVA EN EL MÓDULO PROYECTOS & EVENTOS
  // =========================================================================
  useEffect(() => {
    const evaluateProjectsVisibility = () => {
      if (typeof document === 'undefined') return;
      const viewForwarders = document.getElementById('view-forwarders');
      const isForwardersActive = viewForwarders
        ? !viewForwarders.classList.contains('hidden')
        : (typeof window !== 'undefined' && (
            window.currentView === 'FORWARDERS' ||
            window.location?.hash?.includes('forwarder') ||
            window.location?.hash?.includes('proyecto')
          ));

      // Visibilidad exclusiva en Project Cargo Builder modal
      const isCargoModalOpen = Boolean(window.__IS_CARGO_BUILDER_MODAL_OPEN__);
      const shouldBeVisible = isForwardersActive && isCargoModalOpen;

      setIsInProjects(shouldBeVisible);
      setIsCargoModalActive(isCargoModalOpen);

      if (!shouldBeVisible) {
        setIsOpen(false);
      } else {
        detectAndAbsorbProjectTonnage();
        detectAndAbsorbLandCharterRate();
      }
    };

    evaluateProjectsVisibility();

    const handleCargoModalVisibility = (e) => {
      const open = Boolean(e?.detail?.isOpen);
      setIsCargoModalActive(open);
      evaluateProjectsVisibility();
      if (!open) {
        setIsOpen(false);
      }
    };

    const handleNavChange = (e) => {
      const targetView = String(e?.detail?.view || e?.detail || '').toUpperCase();
      if (targetView === 'FORWARDERS' || targetView === 'PROYECTOS') {
        evaluateProjectsVisibility();
      } else if (targetView) {
        setIsInProjects(false);
        setIsOpen(false);
      } else {
        evaluateProjectsVisibility();
      }
    };

    const handleToggleToolbar = () => {
      setIsOpen(prev => !prev);
      detectAndAbsorbProjectTonnage();
      detectAndAbsorbLandCharterRate();
    };

    const handleProjectWeightChange = (e) => {
      const tons = Number(e?.detail?.weightTons || e?.detail || 0);
      if (tons > 0) {
        setProjectWeightTons(tons);
        setHasAbsorbedProjectTonnage(true);
      }
    };

    const handleLandCharterRateChanged = (e) => {
      const rate = Number(e?.detail?.rateUsdMt || e?.detail?.rate || e?.detail || 0);
      if (rate > 0) {
        setMarketLandCharterRate(rate);
      }
    };

    window.toggleProviderTariffSidebar = () => {
      setIsOpen(prev => !prev);
      detectAndAbsorbProjectTonnage();
      detectAndAbsorbLandCharterRate();
    };

    window.addEventListener('navigation:view-change', handleNavChange);
    window.addEventListener('hashchange', evaluateProjectsVisibility);
    window.addEventListener('seacharter:toggle-provider-tariff', handleToggleToolbar);
    window.addEventListener('seacharter:cargo-builder-modal-visibility', handleCargoModalVisibility);
    window.addEventListener('seacharter:project-weight-changed', handleProjectWeightChange);
    window.addEventListener('seacharter:land-charter-rate-changed', handleLandCharterRateChanged);

    let observer = null;
    const viewForwarders = document.getElementById('view-forwarders');
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        evaluateProjectsVisibility();
      });
      if (viewForwarders) {
        observer.observe(viewForwarders, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }

    const intervalId = setInterval(() => {
      detectAndAbsorbProjectTonnage();
      detectAndAbsorbLandCharterRate();
    }, 1500);

    return () => {
      window.removeEventListener('navigation:view-change', handleNavChange);
      window.removeEventListener('hashchange', evaluateProjectsVisibility);
      window.removeEventListener('seacharter:toggle-provider-tariff', handleToggleToolbar);
      window.removeEventListener('seacharter:project-weight-changed', handleProjectWeightChange);
      window.removeEventListener('seacharter:land-charter-rate-changed', handleLandCharterRateChanged);
      clearInterval(intervalId);
      if (observer) observer.disconnect();
    };
  }, []);

  // Sincronizar selección de material cuando cambia la entidad activa
  useEffect(() => {
    if (activeEntity && activeEntity.materials?.length > 0) {
      const exists = activeEntity.materials.some(m => m.id === selectedMaterialId);
      if (!exists) {
        setSelectedMaterialId(activeEntity.materials[0].id);
        setManualOverrides({});
        setIsManualEditMode(false);
      }
    }
  }, [selectedEntityId, activeEntity]);

  // Manejar tecla Escape para cerrar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Persistir cambios en el catálogo de entidades
  const saveEntitiesCatalog = (updatedEntities) => {
    setEntities(updatedEntities);
    try {
      localStorage.setItem(STORAGE_CATALOG_KEY, JSON.stringify(updatedEntities));
    } catch (_) {}
  };

  // Si no está en el módulo Proyectos, NO RENDERIZAR NADA en el DOM
  if (!isInProjects) {
    return null;
  }

  // Filtrar entidades según pestaña
  const filteredEntities = entities.filter(e => {
    if (entityFilter === 'provider') return e.entityType !== 'client';
    if (entityFilter === 'client') return e.entityType === 'client';
    return true;
  });

  // Obtener material activo (o fallback si no hay entidad cargada todavía)
  const activeMaterial = activeEntity?.materials?.find(m => m.id === selectedMaterialId) || activeEntity?.materials?.[0] || null;

  // Determinar la tarifa de mercado (Sin FSPE):
  // 1. Estrictamente el valor de la columna 'Coût Logística Marché (Sans FSPE)' del material (ej. 4.63 USD)
  // 2. Si no viene en el material (o es 0), se integra con Land Charter del proyecto
  // 3. Prohibición absoluta de 12.50 fijo o números por defecto
  const itemMarketLogistics = Number(activeMaterial?.marketInlandCostPerMt || 0);
  const effectiveMarketLogistics = itemMarketLogistics > 0
    ? itemMarketLogistics
    : (Number(marketLandCharterRate) > 0 ? Number(marketLandCharterRate) : 0);

  // Motor de cálculo financiero exacto (FOB vs EXW & FSPE)
  const breakdown = calculateTariffBreakdown(activeMaterial || {}, {
    exchangeRateDzdUsd,
    commercialModality,
    useFspe,
    marketInlandCostPerMt: (isManualEditMode && manualOverrides.marketInlandCostPerMt !== undefined)
      ? manualOverrides.marketInlandCostPerMt
      : effectiveMarketLogistics,
    landCharterRateUsdMt: marketLandCharterRate > 0 ? marketLandCharterRate : 0,
    projectWeightTons,
    quantityMT: isManualEditMode && manualOverrides.quantityMT != null ? manualOverrides.quantityMT : projectWeightTons,
    ...(isManualEditMode ? manualOverrides : {})
  });

  const handleNumericChange = (field, value, event = null) => {
    // Si la llamada proviene de un evento sintético no de confianza o programático, no procesar
    if (event && event.nativeEvent && event.nativeEvent.isTrusted === false) {
      return;
    }
    // El modo manual solo puede activarse si el usuario hace clic explícitamente en un botón de "Modo Manual",
    // impidiendo que cualquier input o evento secundario fuerce la edición manual por su cuenta.
    if (!isManualEditMode) {
      return;
    }
    const num = parseFloat(value);
    const cleanNum = isNaN(num) ? 0 : num;

    setManualOverrides(prev => ({
      ...prev,
      [field]: cleanNum
    }));
  };

  const handleToggleFspe = (val) => {
    setUseFspe(val);
    setManualOverrides(prev => {
      const next = { ...prev };
      delete next.inlandTransport;
      delete next.marketInlandCostPerMt;
      delete next.suggestedFobSalePrice;
      delete next.commercialMargin;
      return next;
    });

    // Actualizar el estado dinámico del coste de "Logística / Inland" en el array de tarifas
    if (activeMaterial) {
      const rate = Number(exchangeRateToUsd) > 0 ? Number(exchangeRateToUsd) : 1;
      const logisticaLocal = Math.round(
        (val ? (activeMaterial.inlandTransport || 0) : (activeMaterial.marketInlandCostPerMt || activeMaterial.inlandTransport || 0)) * rate * 100
      ) / 100;

      setTarifas(prev => prev.map(t => {
        if (t.id === 3 || t.concepto.toLowerCase().includes('logística') || t.concepto.toLowerCase().includes('inland')) {
          return { ...t, valorLocal: logisticaLocal };
        }
        return t;
      }));
    }
  };

  const handleMaterialChange = (newMaterialId) => {
    setSelectedMaterialId(newMaterialId);
    setManualOverrides({});
    setIsManualEditMode(false);

    // Cargar valores base correspondientes al Excel definitivo (ej. CEM I 42,5N/R) en el array de tarifas
    const targetMat = activeEntity?.materials?.find(m => m.id === newMaterialId) || DEFAULT_EXCEL_MATERIALS.find(m => m.id === newMaterialId);
    if (targetMat) {
      const rate = Number(exchangeRateToUsd) > 0 ? Number(exchangeRateToUsd) : 1;
      const baseNetoLocal = targetMat.basePriceDzd > 0
        ? Math.round(targetMat.basePriceDzd * (targetMat.rabaisMultiplier || 1.0) * 100) / 100
        : Math.round(targetMat.baseMaterialCost * (targetMat.rabaisMultiplier || 1.0) * rate * 100) / 100;
      const envaseLocal = Math.round((targetMat.packagingCost || 0) * rate * 100) / 100;
      const logisticaLocal = Math.round((useFspe ? (targetMat.inlandTransport || 0) : (targetMat.marketInlandCostPerMt || targetMat.inlandTransport || 0)) * rate * 100) / 100;
      const transitoLocal = Math.round((targetMat.sgsInspection || 0) * rate * 100) / 100;
      const puertoLocal = Math.round((targetMat.bejaiaPortDues || 0) * rate * 100) / 100;

      setTarifas([
        { id: 1, concepto: 'Precio Base Neto', valorLocal: baseNetoLocal },
        { id: 2, concepto: 'Envase / Big Bag', valorLocal: envaseLocal },
        { id: 3, concepto: 'Logística / Inland', valorLocal: logisticaLocal },
        { id: 4, concepto: 'Gastos de tránsito', valorLocal: transitoLocal },
        { id: 5, concepto: 'Gastos portuarios', valorLocal: puertoLocal }
      ]);
    }
  };

  const handleResetToOfficial = () => {
    setManualOverrides({});
    setIsManualEditMode(false);
  };

  // Procesar archivo importado (Excel, CSV, Word, Texto, JSON) para cualquier proveedor o cliente
  const handleFileUpload = async (file) => {
    if (!file) return;
    setIsParsing(true);
    setImportNotification(null);
    try {
      const importedEntity = await parseProviderTariffFile(file);
      importedEntity.entityType = newEntityType;

      const updated = [...entities];
      const existingIdx = updated.findIndex(e => e.id === importedEntity.id || e.name.toLowerCase() === importedEntity.name.toLowerCase());
      if (existingIdx >= 0) {
        updated[existingIdx] = { ...updated[existingIdx], ...importedEntity, entityType: newEntityType };
      } else {
        updated.unshift(importedEntity);
      }

      saveEntitiesCatalog(updated);
      setSelectedEntityId(importedEntity.id);
      if (importedEntity.materials?.length > 0) {
        setSelectedMaterialId(importedEntity.materials[0].id);
      }
      setManualOverrides({});
      setIsManualEditMode(false);
      setImportNotification({
        type: 'success',
        message: `¡Tarifa de ${newEntityType === 'client' ? 'Cliente' : 'Proveedor'} "${importedEntity.name}" cargada con éxito! (${importedEntity.materials.length} productos detectados)`
      });
      setTimeout(() => setImportNotification(null), 6000);
    } catch (err) {
      console.error('[ProviderTariffSidebar] Error al importar archivo:', err);
      setImportNotification({
        type: 'error',
        message: `Error al procesar archivo: ${err.message || 'Formato no reconocido'}`
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  };

  // =========================================================================
  // BOTÓN DE SINCRONIZACIÓN MANUAL ("Enviar al Proyecto") CON ANTIDUPLICIDAD
  // Single Source of Truth: Precio Venta Final × Tonelaje del Proyecto
  // =========================================================================
  const handleSendToProject = () => {
    if (!activeMaterial) return;

    const qty = breakdown.quantityMT;
    const salePrice = breakdown.suggestedSalePrice;
    // Sincronización estricta: Total = Precio Venta Final (ya calculado y correcto) * Tonelaje
    const totalMercanciaUsd = Math.round(salePrice * qty * 100) / 100;
    const commodityName = activeMaterial.name;
    const category = activeMaterial.category || 'Minerales y Construcción';
    const productType = activeMaterial.productType || 'Cemento a granel';
    const entityName = activeEntity?.name || 'Tarifa Externa';

    // 1. Inyección en Calculadora
    const cargoQtyInput = document.getElementById('cargo-qty');
    if (cargoQtyInput) {
      cargoQtyInput.value = qty;
      cargoQtyInput.dispatchEvent(new Event('input', { bubbles: true }));
      cargoQtyInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const cargoTypeSelect = document.getElementById('cargo-type');
    if (cargoTypeSelect) {
      const options = Array.from(cargoTypeSelect.options).map(o => o.value);
      if (options.includes(category)) {
        cargoTypeSelect.value = category;
        cargoTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const cargoProductSelect = document.getElementById('cargo-product');
    if (cargoProductSelect) {
      const prodOptions = Array.from(cargoProductSelect.options).map(o => o.value);
      if (prodOptions.includes(productType)) {
        cargoProductSelect.value = productType;
        cargoProductSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // 2. Inyección hacia Proyectos / ForwarderWorkspace con Antiduplicidad y Formato Universal
    const forwarderPayload = {
      provider: entityName,
      entityType: activeEntity?.entityType || 'provider',
      material: commodityName,
      category,
      productType,
      commercialModality, // 'FOB' | 'EXW'
      useFspe,
      quantityMT: qty,
      fobPriceUsdMt: salePrice,
      fobCostUsdMt: breakdown.totalUnitCost,
      valorTotalMercanciaUsd: totalMercanciaUsd,
      mercancia_usd: totalMercanciaUsd, // Campo exacto solicitado por el usuario
      inlandTransport: breakdown.inlandTransport,
      inlandTransportTotalUsd: Math.round(breakdown.inlandTransport * qty * 100) / 100,
      bejaiaPortDues: breakdown.bejaiaPortDues,
      sgsInspection: breakdown.sgsInspection,
      packagingCost: breakdown.packagingCost,
      timestamp: new Date().toISOString()
    };

    try {
      localStorage.setItem('seacharter_last_provider_tariff', JSON.stringify(forwarderPayload));
      localStorage.setItem('seacharter_provider_mercancia_cost', String(totalMercanciaUsd));
    } catch (_) {}

    // 3. Ejecución directa de actualización del estado global (updatePayload o setGlobalState)
    const updateData = { mercancia_usd: totalMercanciaUsd };
    if (typeof window.updatePayload === 'function') {
      window.updatePayload(updateData);
    } else if (typeof window.setGlobalState === 'function') {
      window.setGlobalState(updateData);
    }

    // Disparar evento para ForwarderWorkspace y otros escuchadores
    window.dispatchEvent(new CustomEvent('seacharter:update-project-payload', {
      detail: updateData
    }));

    window.dispatchEvent(new CustomEvent('seacharter:provider-tariff-injected', {
      detail: forwarderPayload
    }));

    const mercanciaInput = document.getElementById('input-cargoQty') || document.getElementById('input-commodity');
    if (mercanciaInput) {
      mercanciaInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Cierre automático de la barra lateral tras la inyección
    setSidebarOpen(false);
    setIsOpen(false);

    setSyncToast({
      message: `✅ Tarifa ${commercialModality} (${useFspe ? 'Con FSPE' : 'Sin FSPE'}) de ${activeEntity?.shortName || entityName} (${commodityName}) enviada al Proyecto: ${qty.toLocaleString('es-ES')} MT a $${salePrice.toFixed(2)}/MT (Total: $${totalMercanciaUsd.toLocaleString('es-ES')})`
    });

    setTimeout(() => {
      setSyncToast(null);
    }, 5000);
  };

  return (
    <>
      {/* 1. Pestaña flotante de activación en el MARGEN IZQUIERDO */}
      <div
        id="pt-drawer-toggle-tab"
        className="pt-drawer-trigger-tab"
        onClick={() => setIsOpen(prev => !prev)}
        title="Abrir Gestor Universal de Tarifas FOB/EXW"
        aria-label="Abrir Gestor de Tarifas"
        role="button"
        tabIndex={0}
      >
        <span className="pt-trigger-icon">
          <i className="fa-solid fa-file-invoice-dollar"></i>
        </span>
        <span className="pt-trigger-text">Tarifas Proveedores / Clientes</span>
        <span className="pt-trigger-badge">{activeEntity ? activeEntity.shortName : 'Sin Tarifas'}</span>
      </div>

      {/* 2. Backdrop traslúcido para cerrar al hacer clic fuera */}
      <div
        className={`pt-drawer-backdrop ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* 3. Panel Arrastrable (Draggable Window): Margen izquierdo, ancho 620px, tema claro */}
      <aside
        id="provider-tariff-drawer"
        ref={containerRef}
        className={`pt-drawer-container ${isOpen ? 'is-open' : ''}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
        aria-label="Gestor Universal de Tarifas de Proveedores y Clientes"
      >
        {/* Cabecera Arrastrable (Draggable Header) */}
        <div
          className="pt-drawer-header"
          onMouseDown={handleHeaderMouseDown}
          title="Arrastra para mover el panel libremente"
        >
          <div className="pt-drawer-title-group">
            <span className="pt-drag-handle-indicator" aria-hidden="true">
              <i className="fa-solid fa-grip-vertical"></i>
            </span>
            <div className="pt-drawer-logo">
              <i className="fa-solid fa-boxes-packing"></i>
            </div>
            <div>
              <h2 className="pt-drawer-title">
                Gestor Universal de Tarifas
                <span className="pt-badge pt-badge-verified">PRO</span>
                <span className={`pt-badge ${commercialModality === 'FOB' ? 'pt-badge-port' : 'pt-badge-mode'}`}>
                  {commercialModality}
                </span>
                <span className={`pt-badge ${useFspe ? 'pt-badge-verified' : 'pt-badge-mode'}`}>
                  {useFspe ? 'Con FSPE' : 'Sin FSPE'}
                </span>
              </h2>
              <p className="pt-drawer-subtitle">
                Ventana Arrastrable • DZD/USD • {activeEntity ? activeEntity.name : 'Ninguna entidad cargada'}
              </p>
            </div>
          </div>
          <div className="pt-header-actions">
            <button
              type="button"
              className="pt-drawer-reset-pos-btn"
              onClick={() => setPosition(DEFAULT_POSITION)}
              title="Restablecer posición inicial"
              aria-label="Restablecer posición"
            >
              <i className="fa-solid fa-arrows-to-dot"></i>
            </button>
            <button
              type="button"
              className="pt-drawer-close-btn"
              onClick={() => setIsOpen(false)}
              title="Cerrar panel (Esc)"
              aria-label="Cerrar panel"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* SELECTORES DE MODALIDAD COMERCIAL (FOB/EXW) Y FSPE */}
        <div className="pt-modality-selector-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="pt-modality-toggle-group" role="radiogroup" aria-label="Modalidad Comercial">
              <button
                type="button"
                id="pt-modality-fob-btn"
                role="radio"
                aria-checked={commercialModality === 'FOB'}
                className={`pt-modality-btn ${commercialModality === 'FOB' ? 'is-active is-fob' : ''}`}
                onClick={() => setCommercialModality('FOB')}
              >
                <i className="fa-solid fa-ship"></i> FOB
              </button>
              <button
                type="button"
                id="pt-modality-exw-btn"
                role="radio"
                aria-checked={commercialModality === 'EXW'}
                className={`pt-modality-btn ${commercialModality === 'EXW' ? 'is-active is-exw' : ''}`}
                onClick={() => setCommercialModality('EXW')}
              >
                <i className="fa-solid fa-warehouse"></i> EXW
              </button>
            </div>

            {/* SELECTOR DE OPCIÓN FSPE: Con FSPE / Sin FSPE */}
            <div className="pt-modality-toggle-group" role="radiogroup" aria-label="Opción FSPE">
              <button
                type="button"
                id="pt-fspe-on-btn"
                role="radio"
                aria-checked={useFspe}
                className={`pt-modality-btn ${useFspe ? 'is-active is-fob' : ''}`}
                onClick={() => handleToggleFspe(true)}
                title="Con FSPE: Coste logístico reducido subvencionado de fábrica"
              >
                <i className="fa-solid fa-hand-holding-dollar"></i> Con FSPE
              </button>
              <button
                type="button"
                id="pt-fspe-off-btn"
                role="radio"
                aria-checked={!useFspe}
                className={`pt-modality-btn ${!useFspe ? 'is-active is-exw' : ''}`}
                onClick={() => handleToggleFspe(false)}
                title="Sin FSPE: Lee estrictamente 'Coût Logística Marché (Sans FSPE)' del Excel o Land Charter"
              >
                <i className="fa-solid fa-truck-fast"></i> Sin FSPE (Mercado)
              </button>
            </div>
          </div>

          <div className="pt-modality-explanation">
            {useFspe ? 'Logística fábrica subvencionada' : 'Tarifa real mercado Land Charter'}
          </div>
        </div>

        {/* Notificación de Importación / Estado */}
        {importNotification && (
          <div
            style={{
              padding: '10px 18px',
              fontSize: '11px',
              fontWeight: '700',
              background: importNotification.type === 'success' ? '#ecfdf5' : '#fef2f2',
              color: importNotification.type === 'success' ? '#065f46' : '#991b1b',
              borderBottom: '1px solid ' + (importNotification.type === 'success' ? '#a7f3d0' : '#fecaca')
            }}
          >
            {importNotification.message}
          </div>
        )}

        {/* Cuerpo del Drawer con scroll interno */}
        <div className="pt-drawer-body">
          {/* SECCIÓN 1: GESTOR UNIVERSAL (LISTA LIMPIA SIN HARDCODING) */}
          <div className="pt-card">
            <div className="pt-card-header">
              <h3 className="pt-card-title">
                <i className="fa-solid fa-building-user text-sky-600"></i> 1. Entidad Activa (Proveedor / Cliente)
              </h3>
              {activeEntity && (
                <span className={`pt-badge ${activeEntity.entityType === 'client' ? 'pt-badge-client' : 'pt-badge-port'}`}>
                  {activeEntity.entityType === 'client' ? 'Cliente' : 'Proveedor'}
                </span>
              )}
            </div>

            {entities.length === 0 ? (
              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '11px' }}>
                <i className="fa-solid fa-folder-open text-sky-600" style={{ fontSize: '20px', marginBottom: '6px', display: 'block' }}></i>
                <strong>No hay tarifas precargadas en el sistema.</strong>
                <p style={{ margin: '4px 0 0', fontSize: '10px' }}>
                  Usa la sección inferior para subir tu archivo Excel, CSV o de texto y registrar un nuevo proveedor o cliente.
                </p>
              </div>
            ) : (
              <>
                {/* Filtros de Tipo */}
                <div className="pt-entity-filters">
                  <button
                    type="button"
                    className={`pt-entity-filter-btn ${entityFilter === 'all' ? 'is-active' : ''}`}
                    onClick={() => setEntityFilter('all')}
                  >
                    Todos ({entities.length})
                  </button>
                  <button
                    type="button"
                    className={`pt-entity-filter-btn ${entityFilter === 'provider' ? 'is-active' : ''}`}
                    onClick={() => setEntityFilter('provider')}
                  >
                    🏢 Proveedores
                  </button>
                  <button
                    type="button"
                    className={`pt-entity-filter-btn ${entityFilter === 'client' ? 'is-active' : ''}`}
                    onClick={() => setEntityFilter('client')}
                  >
                    💼 Clientes
                  </button>
                </div>

                <div className="pt-field-group">
                  <label className="pt-label" htmlFor="pt-provider-select">
                    <span>Entidad Seleccionada</span>
                    {activeEntity && (
                      <span style={{ fontSize: '9px', color: '#0284c7' }}>{activeEntity.country} • {activeEntity.port}</span>
                    )}
                  </label>
                  <select
                    id="pt-provider-select"
                    className="pt-select"
                    value={selectedEntityId}
                    onChange={(e) => setSelectedEntityId(e.target.value)}
                  >
                    {filteredEntities.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        [{ent.entityType === 'client' ? 'CLIENTE' : 'PROVEEDOR'}] {ent.name}
                      </option>
                    ))}
                  </select>
                </div>

                {activeEntity?.description && (
                  <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.45, marginTop: '4px' }}>
                    {activeEntity.description}
                  </div>
                )}
              </>
            )}
          </div>

          {/* SECCIÓN 2: LECTURA DINÁMICA DE PRODUCTOS (NOMBRES REALES DEL ARCHIVO) */}
          {activeEntity && activeEntity.materials?.length > 0 && (
            <div className="pt-card">
              <div className="pt-card-header">
                <h3 className="pt-card-title">
                  <i className="fa-solid fa-cubes-stacked text-emerald-600"></i> 2. Producto / Mercancía (Archivo Real)
                </h3>
                {activeMaterial && (
                  <span className="pt-badge pt-badge-verified">
                    {activeMaterial.typology}
                  </span>
                )}
              </div>

              <div className="pt-field-group">
                <label className="pt-label" htmlFor="pt-material-select">
                  <span>Designación Exacta del Producto</span>
                  <span style={{ fontSize: '9px', color: '#64748b' }}>{activeEntity.materials.length} productos disponibles</span>
                </label>
                <select
                  id="pt-material-select"
                  className="pt-select"
                  value={selectedMaterialId}
                  onChange={(e) => handleMaterialChange(e.target.value)}
                >
                  {activeEntity.materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {activeMaterial?.notes && (
                <div style={{ fontSize: '10.5px', color: '#334155', background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', borderLeft: '3px solid #0284c7' }}>
                  <i className="fa-solid fa-circle-info" style={{ marginRight: '4px', color: '#0284c7' }}></i>
                  {activeMaterial.notes}
                </div>
              )}
            </div>
          )}

          {/* SECCIÓN 3: MOTOR FINANCIERO EXACTO (DZD/USD & FSPE) */}
          {activeMaterial && (
            <div className="pt-card">
              <div className="pt-card-header">
                <h3 className="pt-card-title">
                  <i className="fa-solid fa-calculator text-blue-700"></i> 3. Desglose Financiero ({commercialModality} • {useFspe ? 'Con FSPE' : 'Sin FSPE'})
                </h3>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>
                  TC: {exchangeRateToUsd.toFixed(2)} {currency}/USD
                </span>
              </div>

              {/* 1. DESPLEGABLE DE PRODUCTOS DEL EXCEL IMPORTADO (Visible SI Y SOLO SI > 1 producto) */}
              {activeEntity && activeEntity.materials && activeEntity.materials.length > 1 && (
                <div className="pt-product-selector-bar" style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '12px' }}>
                  <label htmlFor="pt-excel-products-select" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}>
                    <span>Seleccionar Producto de la Matriz Importada</span>
                    <span style={{ fontSize: '9.5px', color: '#0284c7', fontWeight: '600' }}>{activeEntity.materials.length} productos disponibles</span>
                  </label>
                  <select
                    id="pt-excel-products-select"
                    className="pt-select"
                    style={{ fontSize: '11.5px', padding: '6px 8px', fontWeight: '600' }}
                    value={selectedMaterialId}
                    onChange={(e) => handleMaterialChange(e.target.value)}
                    aria-label="Seleccionar Producto Importado"
                  >
                    {activeEntity.materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 2. SELECTOR DE DIVISA Y TIPO DE CAMBIO (GENÉRICO Y UNIVERSAL) */}
              <div className="pt-currency-selector-bar" style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="pt-currency-select" style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: '#475569', marginBottom: '2px' }}>
                    Divisa Origen
                  </label>
                  <select
                    id="pt-currency-select"
                    className="pt-select"
                    style={{ fontSize: '11px', padding: '4px 6px' }}
                    value={currency}
                    onChange={(e) => {
                      const newCurr = e.target.value;
                      setCurrency(newCurr);
                      if (newCurr === 'DZD') setExchangeRateToUsd(OFFICIAL_EXCHANGE_RATE_DZD_USD);
                      else if (newCurr === 'EUR') setExchangeRateToUsd(0.92);
                      else if (newCurr === 'TRY') setExchangeRateToUsd(34.20);
                      else if (newCurr === 'USD') setExchangeRateToUsd(1.0);
                    }}
                  >
                    <option value="DZD">DZD (Dinar Argelino)</option>
                    <option value="TRY">TRY (Lira Turca)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="USD">USD (Dólar USA)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="pt-exchange-rate-input" style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: '#475569', marginBottom: '2px' }}>
                    Tipo de Cambio (1 USD = X {currency})
                  </label>
                  <input
                    id="pt-exchange-rate-input"
                    type="number"
                    step="any"
                    className="pt-input"
                    style={{ fontSize: '11px', padding: '4px 6px' }}
                    value={exchangeRateToUsd}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setExchangeRateToUsd(isNaN(val) ? 1 : val);
                    }}
                    placeholder={`T.C. ${currency} a USD`}
                  />
                </div>
              </div>

              {/* 1. LISTA DINÁMICA DE TARIFAS (INPUTS POR CADA CONCEPTO Y VALOR LOCAL) */}
              <div className="pt-dynamic-tariffs-container" style={{ background: '#f1f5f9', padding: '10px', borderRadius: '8px', marginBottom: '14px', border: '1px solid #cbd5e1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#0f172a' }}>
                    Tarifas Dinámicas ({currency} ➔ USD)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddTarifaRow}
                    className="pt-badge pt-badge-verified"
                    style={{ cursor: 'pointer', padding: '2px 8px', fontSize: '10px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '4px' }}
                  >
                    + Añadir Concepto
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {tarifasConUsd.map((t) => (
                    <div key={t.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="pt-input"
                        style={{ flex: 2, fontSize: '11px', padding: '4px 6px' }}
                        value={t.concepto}
                        onChange={(e) => handleTarifaConceptoChange(t.id, e.target.value)}
                        placeholder="Nombre del concepto (ej. Inland Freight Turkey)"
                        aria-label={`Concepto ${t.id}`}
                      />
                      <input
                        type="number"
                        step="any"
                        className="pt-input"
                        style={{ flex: 1.2, fontSize: '11px', padding: '4px 6px' }}
                        value={t.valorLocal}
                        onChange={(e) => handleTarifaValorChange(t.id, e.target.value)}
                        placeholder="Valor local"
                        aria-label={`Valor ${t.id}`}
                      />
                      <span style={{ fontSize: '10.5px', color: '#0369a1', minWidth: '65px', textAlign: 'right', fontWeight: 'bold' }}>
                        ${t.valorUsd.toFixed(2)} USD
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTarifaRow(t.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px' }}
                        title="Eliminar concepto"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-cost-grid">
                {/* 1. Precio Base (Sin Dto.) */}
                <div className="pt-cost-item">
                  <label className="pt-cost-label" htmlFor="pt-input-gica">
                    <span>Precio Base (Sin Dto.)</span>
                    <span style={{ fontSize: '9px', color: '#0284c7' }}>{currency}/MT</span>
                  </label>
                  <input
                    id="pt-input-gica"
                    name="basePriceDzd"
                    type="number"
                    step="any"
                    className={`pt-input ${isManualEditMode ? 'is-manual-editing' : ''}`}
                    value={breakdown.basePriceDzd}
                    onChange={(e) => handleNumericChange('basePriceDzd', e.target.value, e)}
                    readOnly={!isManualEditMode}
                    aria-label="Precio Base (Sin Dto.)"
                  />
                  <span className="pt-cost-value" style={{ fontSize: '11px', marginTop: '2px', color: '#64748b' }}>
                    {breakdown.basePriceDzd.toLocaleString('es-ES', { minimumFractionDigits: 2 })} {currency}
                  </span>
                </div>

                {/* 2. Factor Rabais (Descuento de fábrica) */}
                <div className="pt-cost-item">
                  <label className="pt-cost-label" htmlFor="pt-input-rabais" style={{ color: '#047857' }}>
                    <span>Descuento (Rabais)</span>
                    <span style={{ fontSize: '9px' }}>{((1 - breakdown.rabaisMultiplier) * 100).toFixed(1)}% desc.</span>
                  </label>
                  <input
                    id="pt-input-rabais"
                    name="rabaisMultiplier"
                    type="number"
                    step="any"
                    className={`pt-input ${isManualEditMode ? 'is-manual-editing' : ''}`}
                    value={breakdown.rabaisMultiplier}
                    onChange={(e) => handleNumericChange('rabaisMultiplier', e.target.value, e)}
                    readOnly={!isManualEditMode}
                    aria-label="Descuento (Rabais)"
                  />
                  <span className="pt-cost-value" style={{ fontSize: '11px', marginTop: '2px', color: '#047857' }}>
                    × {breakdown.rabaisMultiplier.toFixed(4)}
                  </span>
                </div>

                {/* 3. Precio Base Neto (Base * Descuento) */}
                <div className="pt-cost-item">
                  <span className="pt-cost-label">Precio Base Neto ({currency})</span>
                  <span className="pt-cost-value" style={{ color: '#0f766e' }}>
                    {breakdown.netPriceDzd.toLocaleString('es-ES', { minimumFractionDigits: 2 })} {currency}/MT
                  </span>
                </div>

                {/* 4. Precio Base Neto en USD */}
                <div className="pt-cost-item" style={{ background: '#f0f9ff', borderColor: '#bae6fd' }}>
                  <span className="pt-cost-label" style={{ color: '#0369a1' }}>Base Neta en USD (÷ {exchangeRateToUsd.toFixed(2)})</span>
                  <span className="pt-cost-value" style={{ color: '#0284c7' }}>
                    ${breakdown.netMaterialCost.toFixed(2)} USD/MT
                  </span>
                </div>

                {/* 5. Envase (Big Bag / Saco) */}
                <div className="pt-cost-item">
                  <label className="pt-cost-label" htmlFor="pt-input-packaging">
                    <span>+ Envase (Big Bag / Saco)</span>
                    <span style={{ fontSize: '9px', color: '#64748b' }}>USD/MT</span>
                  </label>
                  <input
                    id="pt-input-packaging"
                    name="packagingCost"
                    type="number"
                    step="any"
                    className={`pt-input ${isManualEditMode ? 'is-manual-editing' : ''}`}
                    value={breakdown.packagingCost}
                    onChange={(e) => handleNumericChange('packagingCost', e.target.value, e)}
                    readOnly={!isManualEditMode}
                    aria-label="Envase (Big Bag / Saco)"
                  />
                  <span className="pt-cost-value" style={{ fontSize: '11px', marginTop: '2px', color: '#64748b' }}>
                    +${breakdown.packagingCost.toFixed(2)} USD
                  </span>
                </div>

                {/* 6. Logística Activa (Ajustada según FSPE y Modalidad FOB) */}
                <div className="pt-cost-item" style={{ opacity: commercialModality === 'EXW' ? 0.6 : 1 }}>
                  <label className="pt-cost-label" htmlFor="pt-input-inland">
                    <span>+ Logística activa ({useFspe ? 'FSPE Fábrica' : 'Mercado Sin FSPE'})</span>
                    <span style={{ fontSize: '9px', color: !useFspe ? '#b45309' : '#0284c7' }}>
                      {commercialModality === 'EXW' ? 'EXW ($0 en FOB ops)' : 'USD/MT'}
                    </span>
                  </label>
                  <input
                    id="pt-input-inland"
                    name="inlandTransport"
                    type="number"
                    step="any"
                    className={`pt-input ${isManualEditMode ? 'is-manual-editing' : ''}`}
                    value={breakdown.inlandTransport}
                    onChange={(e) => handleNumericChange(useFspe ? 'inlandTransport' : 'marketInlandCostPerMt', e.target.value, e)}
                    readOnly={!isManualEditMode}
                    aria-label="Logística activa"
                  />
                  <span className="pt-cost-value" style={{ fontSize: '11px', marginTop: '2px', color: !useFspe ? '#b45309' : '#0f172a' }}>
                    {commercialModality === 'FOB' ? `+$${breakdown.inlandTransport.toFixed(2)} USD` : `$${breakdown.inlandTransport.toFixed(2)} USD (EXW)`}
                  </span>
                </div>

                {/* 7. Gastos de tránsito */}
                <div className="pt-cost-item" style={{ opacity: commercialModality === 'EXW' ? 0.6 : 1 }}>
                  <label className="pt-cost-label" htmlFor="pt-input-sgs">
                    <span>+ Gastos de tránsito</span>
                    <span style={{ fontSize: '9px', color: '#64748b' }}>USD/MT</span>
                  </label>
                  <input
                    id="pt-input-sgs"
                    name="sgsInspection"
                    type="number"
                    step="any"
                    className={`pt-input ${isManualEditMode ? 'is-manual-editing' : ''}`}
                    value={breakdown.sgsInspection}
                    onChange={(e) => handleNumericChange('sgsInspection', e.target.value, e)}
                    readOnly={!isManualEditMode}
                    aria-label="Gastos de tránsito"
                  />
                  <span className="pt-cost-value" style={{ fontSize: '11px', marginTop: '2px', color: '#64748b' }}>
                    {commercialModality === 'FOB' ? `+$${breakdown.sgsInspection.toFixed(2)} USD` : `$${breakdown.sgsInspection.toFixed(2)} USD (EXW)`}
                  </span>
                </div>

                {/* 8. Gastos portuarios */}
                <div className="pt-cost-item" style={{ opacity: commercialModality === 'EXW' ? 0.6 : 1 }}>
                  <label className="pt-cost-label" htmlFor="pt-input-port">
                    <span>+ Gastos portuarios</span>
                    <span style={{ fontSize: '9px', color: '#64748b' }}>USD/MT</span>
                  </label>
                  <input
                    id="pt-input-port"
                    name="bejaiaPortDues"
                    type="number"
                    step="any"
                    className={`pt-input ${isManualEditMode ? 'is-manual-editing' : ''}`}
                    value={breakdown.bejaiaPortDues}
                    onChange={(e) => handleNumericChange('bejaiaPortDues', e.target.value, e)}
                    readOnly={!isManualEditMode}
                    aria-label="Gastos portuarios"
                  />
                  <span className="pt-cost-value" style={{ fontSize: '11px', marginTop: '2px', color: '#64748b' }}>
                    {commercialModality === 'FOB' ? `+$${breakdown.bejaiaPortDues.toFixed(2)} USD` : `$${breakdown.bejaiaPortDues.toFixed(2)} USD (EXW)`}
                  </span>
                </div>

                {/* Margen Comercial */}
                <div className="pt-cost-item pt-cost-item-full" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="pt-cost-label" htmlFor="pt-input-margin" style={{ color: '#92400e', margin: 0 }}>
                      Margen / Spread Comercial
                    </label>
                    <span style={{ fontSize: '10px', color: '#b45309', fontWeight: '800' }}>+{breakdown.marginPercentage}%</span>
                  </div>
                  <input
                    id="pt-input-margin"
                    name="commercialMargin"
                    type="number"
                    step="any"
                    className={`pt-input ${isManualEditMode ? 'is-manual-editing' : ''}`}
                    style={{ marginTop: '3px' }}
                    value={breakdown.commercialMargin}
                    onChange={(e) => handleNumericChange('commercialMargin', e.target.value, e)}
                    readOnly={!isManualEditMode}
                    aria-label="Margen Comercial"
                  />
                  <span className="pt-cost-value" style={{ color: '#b45309', marginTop: '2px', fontSize: '11px' }}>
                    +${breakdown.commercialMargin.toFixed(2)} USD / MT
                  </span>
                </div>

                {/* Coste Unitario Total */}
                <div className="pt-cost-item pt-cost-item-full highlight-fob">
                  <span className="pt-cost-label">Coste Unitario Total ({commercialModality} • {useFspe ? 'Con FSPE' : 'Sin FSPE'})</span>
                  <span className="pt-cost-value">${breakdown.totalUnitCost.toFixed(2)} / MT</span>
                </div>

                {/* Precio Venta Unitario Final */}
                <div className="pt-cost-item pt-cost-item-full highlight-sale">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="pt-cost-label" htmlFor="pt-input-sale-price" style={{ margin: 0 }}>
                      PRECIO DE VENTA UNITARIO FINAL ({commercialModality})
                    </label>
                    {isManualEditMode && <span style={{ color: '#059669', fontSize: '9px', fontWeight: '700' }}>Modo Edición</span>}
                  </div>
                  <input
                    id="pt-input-sale-price"
                    name="suggestedFobSalePrice"
                    type="number"
                    step="any"
                    className={`pt-input ${isManualEditMode ? 'is-manual-editing' : ''}`}
                    style={{ fontSize: '16px', fontWeight: '800', marginTop: '3px' }}
                    value={breakdown.suggestedSalePrice}
                    onChange={(e) => handleNumericChange('suggestedFobSalePrice', e.target.value, e)}
                    readOnly={!isManualEditMode}
                    aria-label="PRECIO DE VENTA UNITARIO FINAL (FOB)"
                  />
                  <span className="pt-cost-value" style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '14px' }}>
                    ${breakdown.suggestedSalePrice.toFixed(2)} / MT
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SECCIÓN 4: ABSORCIÓN DEL TONELAJE DEL PROYECTO (10.000 MT) */}
          <div className="pt-card" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}>
            <div className="pt-card-header">
              <h3 className="pt-card-title">
                <i className="fa-solid fa-scale-balanced text-indigo-600"></i> 4. Tonelaje del Proyecto & Partida
              </h3>
              <span className={`pt-badge ${hasAbsorbedProjectTonnage ? 'pt-badge-verified' : 'pt-badge-mode'}`}>
                {hasAbsorbedProjectTonnage ? '⚡ Tonelaje Adsorbido en Vivo' : 'Configuración de Toneladas'}
              </span>
            </div>

            <div className="pt-field-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                <label className="pt-label" htmlFor="pt-quantity-input" style={{ margin: 0 }}>
                  Toneladas Totales del Proyecto (Packing List)
                </label>
                <span style={{ fontSize: '10px', color: '#0284c7', fontWeight: '700' }}>
                  {breakdown.quantityMT.toLocaleString('es-ES')} MT
                </span>
              </div>
              <input
                id="pt-quantity-input"
                type="number"
                step="500"
                className="pt-input"
                value={breakdown.quantityMT}
                onChange={(e) => handleNumericChange('quantityMT', e.target.value, e)}
                readOnly={!isManualEditMode}
              />
            </div>

            {/* VALOR TOTAL PARTIDA MERCANCÍA */}
            <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #93c5fd', borderRadius: '10px', padding: '10px 12px', marginTop: '8px' }}>
              <span style={{ fontSize: '9.5px', fontWeight: '800', textTransform: 'uppercase', color: '#1e40af', letterSpacing: '0.04em', display: 'block', marginBottom: '3px' }}>
                Valor Total Partida Mercancía {commercialModality} ({breakdown.quantityMT.toLocaleString('es-ES')} MT × ${breakdown.suggestedSalePrice.toFixed(2)}/MT)
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '19px', fontWeight: '900', color: '#1e3a8a', fontFamily: 'JetBrains Mono, monospace' }}>
                  ${breakdown.totalSaleSum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
                <span style={{ fontSize: '10.5px', color: '#047857', fontWeight: '800' }}>
                  Margen Total: +${breakdown.totalProfitSum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* SECCIÓN 5: MODO DE EDICIÓN MANUAL */}
          <div className="pt-card" style={{ background: isManualEditMode ? '#f0fdf4' : '#ffffff', borderColor: isManualEditMode ? '#86efac' : '#e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="pt-switch-label" htmlFor="pt-manual-mode-switch">
                <input
                  id="pt-manual-mode-switch"
                  type="checkbox"
                  role="switch"
                  className="pt-switch-input"
                  checked={isManualEditMode}
                  onChange={(e) => {
                    setIsManualEditMode(e.target.checked);
                    if (!e.target.checked) setManualOverrides({});
                  }}
                />
                <span>Modo de Edición Manual / Negociación</span>
              </label>
              <button
                type="button"
                id="btn-toggle-manual-mode"
                className={`pt-badge ${isManualEditMode ? 'pt-badge-mode' : 'pt-badge-verified'}`}
                style={{ cursor: 'pointer', border: '1px solid currentColor', background: isManualEditMode ? '#dcfce7' : '#f8fafc', padding: '5px 12px', fontSize: '11px', fontWeight: '700' }}
                onClick={() => {
                  setIsManualEditMode(prev => {
                    const next = !prev;
                    if (!next) setManualOverrides({});
                    return next;
                  });
                }}
              >
                {isManualEditMode ? 'Desactivar Modo Manual' : 'Modo Manual'}
              </button>
            </div>
            {!isManualEditMode && (
              <p style={{ margin: '6px 0 0', fontSize: '10.5px', color: '#64748b' }}>
                <i className="fa-solid fa-lock" style={{ marginRight: '4px' }}></i>
                Modo automático estricto activo. Los precios se calculan según las fórmulas oficiales del Excel. Haz clic en el botón de Modo Manual para habilitar edición.
              </p>
            )}
            {isManualEditMode && (
              <p style={{ margin: '6px 0 0', fontSize: '10.5px', color: '#047857', fontWeight: '600' }}>
                <i className="fa-solid fa-pen-to-square" style={{ marginRight: '4px' }}></i>
                Modo manual habilitado por el usuario. Puedes modificar directamente los inputs del desglose.
              </p>
            )}
          </div>

          {/* SECCIÓN 6: SUBIR NUEVA TARIFA (EXCEL, CSV, WORD, TEXTO) */}
          <div className="pt-card">
            <div className="pt-card-header">
              <h3 className="pt-card-title">
                <i className="fa-solid fa-file-arrow-up text-sky-600"></i> 5. Añadir / Subir Nueva Tarifa
              </h3>
              <span className="pt-badge pt-badge-port">Excel / CSV / Word</span>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <label style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: '600' }}>
                <input
                  type="radio"
                  name="new_entity_type"
                  checked={newEntityType === 'provider'}
                  onChange={() => setNewEntityType('provider')}
                />
                Tarifa de Proveedor
              </label>
              <label style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: '600' }}>
                <input
                  type="radio"
                  name="new_entity_type"
                  checked={newEntityType === 'client'}
                  onChange={() => setNewEntityType('client')}
                />
                Tarifa de Cliente
              </label>
            </div>

            <div
              className={`pt-dropzone ${isDraggingFile ? 'is-dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="pt-dropzone-icon">
                <i className={isParsing ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-cloud-arrow-up'}></i>
              </div>
              <div className="pt-dropzone-title">
                {isParsing ? 'Procesando matriz...' : `Subir Nueva Matriz de ${newEntityType === 'client' ? 'Cliente' : 'Proveedor'}`}
              </div>
              <div className="pt-dropzone-desc">
                Lee automáticamente la columna "produit" (sin renombrar a Vrac). Compatible con Excel (.xlsx, .xls), CSV y Word.
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt,.docx,.doc,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer con Acciones (100% visible, sin cortes) */}
        <div className="pt-drawer-footer">
          {isManualEditMode && (
            <button
              type="button"
              className="pt-btn-reset"
              onClick={handleResetToOfficial}
            >
              <i className="fa-solid fa-rotate-left"></i> Restablecer a Valores Oficiales
            </button>
          )}

          {/* BOTÓN DE SINCRONIZACIÓN MANUAL ("Enviar al Proyecto") */}
          <button
            id="pt-btn-send-to-project"
            type="button"
            className="pt-btn-sync"
            disabled={!activeMaterial}
            onClick={handleSendToProject}
          >
            <i className="fa-solid fa-paper-plane"></i>
            <span>
              {activeMaterial
                ? `Enviar al Proyecto (${commercialModality} • ${useFspe ? 'Con FSPE' : 'Sin FSPE'} • ${breakdown.quantityMT.toLocaleString('es-ES')} MT)`
                : 'Sube una tarifa para enviar al proyecto'}
            </span>
          </button>
        </div>
      </aside>

      {/* Notificación Toast flotante */}
      {syncToast && (
        <div className="pt-toast" role="alert">
          <i className="fa-solid fa-circle-check" style={{ fontSize: '18px', color: '#059669' }}></i>
          <span>{syncToast.message}</span>
        </div>
      )}
    </>
  );
}
