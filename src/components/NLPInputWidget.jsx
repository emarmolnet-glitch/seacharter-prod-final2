import React, { useEffect, useMemo, useRef, useState } from "react";
import { validateScenarioPortsWithWpi } from "../wpi-catalog-client.js";
import {
  applyVoyageScenarioDefaults,
  hasMinimumVoyageRoute,
} from "../../shared/voyage-scenario-policy.mjs";
import { normalizeNlpVoyagePayload } from "../../shared/cargo-mapper.mjs";

const CARGO_PRODUCTS = Object.freeze({
  "Minerales y Construcción": ["Cemento a granel", "Clínker", "Yeso", "Big Bags (Minerales/Cemento)"],
  "Biomasa y Combustibles Sólidos": [
    "Biomasa (Grignon, Astillas, Pellets)",
    "Carbón mineral",
  ],
  "Carga Siderúrgica y Metales": [
    "Bobinas de Acero (Steel Coils)",
    "Tubos de Acero (Steel Pipes)",
    "Hierro / Chatarra",
  ],
  "Carga Unitizada / Envasada": [
    "Big Bags (Minerales/Cemento)",
    "Carga Paletizada",
  ],
  "Carga de Proyecto (Breakbulk)": ["Piezas Especiales / Maquinaria"],
});

const CRITICAL_FIELDS = Object.freeze([
  ["pol", "Puerto de carga (POL)", "text"],
  ["pod", "Puerto de descarga (POD)", "text"],
]);

const MONTHS = Object.freeze({
  jan: 1,
  january: 1,
  ene: 1,
  enero: 1,
  feb: 2,
  february: 2,
  febrero: 2,
  mar: 3,
  march: 3,
  marzo: 3,
  apr: 4,
  april: 4,
  abr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  june: 6,
  junio: 6,
  jul: 7,
  july: 7,
  julio: 7,
  aug: 8,
  august: 8,
  ago: 8,
  agosto: 8,
  sep: 9,
  sept: 9,
  september: 9,
  septiembre: 9,
  oct: 10,
  october: 10,
  octubre: 10,
  nov: 11,
  november: 11,
  noviembre: 11,
  dec: 12,
  december: 12,
  dic: 12,
  diciembre: 12,
});

function cleanCapture(value = "") {
  return String(value)
    .replace(/^[\s:;,-]+|[\s:;,.\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePositiveNumber(value = "") {
  const compact = String(value).replace(/\s/g, "");
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  let normalized = compact;
  if (hasComma && hasDot) {
    const decimalSeparator = compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = compact.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
  } else if (/^[\d]+[,.]\d{3}$/.test(compact)) {
    normalized = compact.replace(/[,.]/g, "");
  } else {
    normalized = compact.replace(",", ".");
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : "";
}

function normalizeDate(rawValue = "") {
  const value = cleanCapture(rawValue).toLowerCase();
  if (!value) return "";

  const isoMatch = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const numericMatch = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (numericMatch) {
    return `${numericMatch[3]}-${numericMatch[2].padStart(2, "0")}-${numericMatch[1].padStart(2, "0")}`;
  }

  const namedMatch = value.match(/\b(\d{1,2})\s+([a-záéíóúñ]+)\s+(20\d{2})\b/i);
  if (!namedMatch) return "";
  const month = MONTHS[namedMatch[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
  if (!month) return "";
  return `${namedMatch[3]}-${String(month).padStart(2, "0")}-${namedMatch[1].padStart(2, "0")}`;
}

function captureFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanCapture(match[1]);
  }
  return "";
}

function extractScenario(text) {
  const source = String(text || "");
  const laycanText = source.match(/(?:laycan|laydays\s*\/\s*cancelling)\s*[:\-]?\s*([^\n;]+)/i)?.[1] || "";
  const laycanDates = Array.from(laycanText.matchAll(
    /\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2}|\d{1,2}\s+[a-záéíóúñ]+\s+20\d{2})\b/gi,
  )).map((match) => normalizeDate(match[0])).filter(Boolean);

  const pol = captureFirst(source, [
    /(?:^|[\n;,])\s*(?:pol|puerto\s+de\s+carga|load(?:ing)?\s+port)\s*[:\-]\s*([^\n;,]+)/im,
    /(?:from|desde)\s+([^\n;,]+?)\s+(?:to|hasta|a)\s+[^\n;,]+/i,
  ]);
  const pod = captureFirst(source, [
    /(?:^|[\n;,])\s*(?:pod|puerto\s+de\s+descarga|discharge\s+port)\s*[:\-]\s*([^\n;,]+)/im,
    /(?:from|desde)\s+[^\n;,]+?\s+(?:to|hasta|a)\s+([^\n;,]+)/i,
  ]);
  const laydaysRaw = captureFirst(source, [
    /(?:laydays|laycan\s+(?:start|inicio))\s*[:\-]\s*([^\n;,]+)/i,
  ]);
  const cancellingRaw = captureFirst(source, [
    /(?:cancelling|cancelaci[oó]n|laycan\s+end)\s*[:\-]\s*([^\n;,]+)/i,
  ]);

  return {
    pol,
    pod,
    laydays: normalizeDate(laydaysRaw) || laycanDates[0] || "",
    cancelling: normalizeDate(cancellingRaw) || laycanDates[1] || "",
    cargo_qty: parsePositiveNumber(captureFirst(source, [
      /(?:cargo(?:_qty)?|cantidad(?:\s+de\s+carga)?|quantity)\s*[:\-]?\s*([\d.,\s]+)\s*(?:mt|tm|tons?|tonnes?)?/i,
      /([\d.,\s]+)\s*(?:mt|tm|tons?|tonnes?)\s+(?:of|de)\s+/i,
    ])),
    loading_rate: parsePositiveNumber(captureFirst(source, [
      /(?:loading(?:\s+rate)?|load\s+rate|ritmo\s+(?:de\s+)?carga|loading_rate)\s*[:\-]?\s*([\d.,\s]+)/i,
    ])),
    discharge_rate: parsePositiveNumber(captureFirst(source, [
      /(?:discharg(?:e|ing)(?:\s+rate)?|ritmo\s+(?:de\s+)?descarga|discharge_rate)\s*[:\-]?\s*([\d.,\s]+)/i,
    ])),
  };
}

function normalizeScenarioPayload(payload) {
  const source = payload?.scenario || payload?.extraction || payload?.data || payload || {};
  const loadingRate = parsePositiveNumber(source.ratePOL ?? source.loading_rate ?? source.loadingRate ?? source.load_rate ?? source.rates?.loading ?? source.ritmos?.carga ?? "");
  const dischargeRate = parsePositiveNumber(source.ratePOD ?? source.discharge_rate ?? source.dischargeRate ?? source.disch_rate ?? source.rates?.discharge ?? source.ritmos?.descarga ?? "");
  return applyVoyageScenarioDefaults({
    ...source,
    pol: cleanCapture(source.pol ?? source.route?.pol ?? source.port_of_loading ?? source.loading_port ?? ""),
    pod: cleanCapture(source.pod ?? source.route?.pod ?? source.port_of_discharge ?? source.discharge_port ?? ""),
    laydays: normalizeDate(source.laydays ?? source.layday ?? source.laycan_start ?? ""),
    cancelling: normalizeDate(source.cancelling ?? source.canceling ?? source.laycan_end ?? ""),
    cargo_qty: parsePositiveNumber(source.cargo_qty ?? source.cargoQty ?? source.tonnage ?? source.toneladas ?? source.quantity ?? source.qty ?? ""),
    cargo_type: cleanCapture(source.cargo_type ?? source.cargoType ?? source.commodity ?? ""),
    loading_rate: loadingRate,
    discharge_rate: dischargeRate,
    dwt: parsePositiveNumber(source.dwt ?? source.required_dwt ?? source.requiredDwt ?? ""),
    methodPOL: cleanCapture(source.methodPOL ?? source.loading_method?.value ?? source.loadingMethod?.value ?? source.loading_method ?? source.loadingMethod ?? ""),
    methodPOD: cleanCapture(source.methodPOD ?? source.discharge_method?.value ?? source.dischargeMethod?.value ?? source.discharge_method ?? source.dischargeMethod ?? ""),
    ratePOL: loadingRate,
    ratePOD: dischargeRate,
  });
}

async function requestScenarioExtraction(text) {
  let scenario;
  try {
    const response = await fetch("/api/nlp-voyage-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`NLP voyage extraction HTTP ${response.status}`);
    scenario = normalizeScenarioPayload(await response.json());
  } catch (error) {
    console.warn("NLP voyage endpoint unavailable; using deterministic extraction.", error);
    scenario = normalizeScenarioPayload(extractScenario(text));
  }
  try {
    return await validateScenarioPortsWithWpi(scenario);
  } catch (error) {
    console.warn("WPI catalog is not ready for frontend validation.", error);
    return {
      ...scenario,
      port_validation: {
        valid: false,
        clarification: "El catálogo WPI todavía no está disponible. Revisa POL y POD en los desplegables.",
      },
    };
  }
}

function cloneOptions(selectId) {
  const select = document.getElementById(selectId);
  if (!(select instanceof HTMLSelectElement)) return [];
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.textContent || option.value,
    disabled: option.disabled,
  }));
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function typeIntoControl(id, value) {
  const control = document.getElementById(id);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return false;
  control.disabled = false;
  control.removeAttribute("disabled");
  control.value = String(value);
  control.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
  await delay(45);
  control.dispatchEvent(new Event("change", { bubbles: true }));
  await delay(45);
  return true;
}

async function resolveAndSelectWpiPort(portRecord, inputId) {
  const input = document.getElementById(inputId);
  if (!portRecord || portRecord.source !== "WPI" || !(input instanceof HTMLInputElement)) return null;

  await window.ensureWpiLoadedOnDemand?.();
  const selectedPort = {
    label: portRecord.officialLabel,
    placeName: portRecord.name,
    countryCode: portRecord.countryCode,
    lat: Number(portRecord.latitude),
    lon: Number(portRecord.longitude),
    source: "WPI",
    port: {
      indexNo: Number(portRecord.indexNo) || null,
      regionNo: Number(portRecord.regionNo) || null,
      countryCode: portRecord.countryCode,
      source: "WPI",
    },
  };
  if (!selectedPort || !window.selectUniversalPortSuggestion?.(input, selectedPort)) return null;
  return {
    name: input.value,
    country: selectedPort.countryCode || "",
    lat: Number(selectedPort.lat),
    lng: Number(selectedPort.lon),
    source: selectedPort.source || "WPI",
    port: selectedPort.port || null,
  };
}

function getCargoHandlingProfile(category, product, specification) {
  const cargo = `${category} ${product} ${specification}`.toLowerCase();
  if (cargo.includes("big bag")) {
    return {
      shipMethod: "big_bags_barco",
      portMethod: "big_bags_portuaria",
      shipEfficientCapacity: 4500,
    };
  }
  if (cargo.includes("palet")) {
    return {
      shipMethod: "paletizado_barco",
      portMethod: "paletizado_portuaria",
      shipEfficientCapacity: 4500,
    };
  }
  if (
    cargo.includes("acero")
    || cargo.includes("steel")
    || cargo.includes("sider")
    || cargo.includes("proyecto")
    || cargo.includes("breakbulk")
  ) {
    return {
      shipMethod: "hierro_acero_barco",
      portMethod: "hierro_acero_portuaria",
      shipEfficientCapacity: 5500,
    };
  }
  return {
    shipMethod: "cuchara_grab",
    portMethod: "cuchara_portuaria",
    shipEfficientCapacity: 8500,
  };
}

function optimizeCargoHandlingMethods(category, product, specification, loadingRate, dischargeRate) {
  const profile = getCargoHandlingProfile(category, product, specification);
  const selectMethod = (requiredRate) => {
    const numericRate = parsePositiveNumber(requiredRate);
    if (!numericRate) {
      return {
        value: "",
        equipment: "custom",
        requiredRate: 0,
        shipEfficientCapacity: profile.shipEfficientCapacity,
      };
    }
    const useShipCrane = numericRate > 0 && numericRate <= profile.shipEfficientCapacity;
    return {
      value: useShipCrane ? profile.shipMethod : profile.portMethod,
      equipment: useShipCrane ? "ship-crane" : "port-crane",
      requiredRate: numericRate,
      shipEfficientCapacity: profile.shipEfficientCapacity,
    };
  };

  return {
    pol: selectMethod(loadingRate),
    pod: selectMethod(dischargeRate),
  };
}

function NLPInputWidget() {
  const [isNlpEngineOpen, setIsNlpEngineOpen] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [category, setCategory] = useState("");
  const [product, setProduct] = useState("");
  const [specification, setSpecification] = useState("");
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [specificationOptions, setSpecificationOptions] = useState([]);
  const [missingFields, setMissingFields] = useState([]);
  const [manualValues, setManualValues] = useState({});
  const [portWarning, setPortWarning] = useState("");
  const analyzeAndDispatchRef = useRef(null);

  const productOptions = useMemo(
    () => (CARGO_PRODUCTS[category] || []).map((value) => ({ value, label: value })),
    [category],
  );

  useEffect(() => {
    const source = document.getElementById("cargo-type-manual");
    const refreshOptions = () => {
      setCategoryOptions(cloneOptions("cargo-type"));
      setSpecificationOptions(cloneOptions("cargo-type-manual"));
    };
    refreshOptions();
    if (!source) return undefined;
    const observer = new MutationObserver(refreshOptions);
    observer.observe(source, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const showValidationAlert = (message) => {
    if (typeof window.showToast === "function") window.showToast(message, false, "error");
  };

  const analyzeAndDispatch = async (injectedPayload = null) => {
    const isProgrammaticRequest = injectedPayload && typeof injectedPayload === "object";
    const analysisText = isProgrammaticRequest
      ? JSON.stringify(injectedPayload)
      : String(injectedPayload || requestText).trim();
    if (!analysisText) {
      showValidationAlert("Introduce un requerimiento para analizar.");
      return { applied: false, reason: "empty-payload" };
    }

    let extracted;
    if (isProgrammaticRequest) {
      const normalizedPayload = normalizeScenarioPayload(injectedPayload);
      try {
        extracted = await validateScenarioPortsWithWpi(normalizedPayload);
      } catch (error) {
        console.warn("WPI catalog is not ready for headless validation.", error);
        extracted = normalizedPayload;
      }
    } else {
      extracted = await requestScenarioExtraction(analysisText);
    }
    const scenario = normalizeNlpVoyagePayload({
      ...extracted,
      cargo_category: injectedPayload?.category || injectedPayload?.categoria || injectedPayload?.cargo_category || category || extracted.cargo_category,
      cargo_product: injectedPayload?.product || injectedPayload?.producto || injectedPayload?.cargo_product || product || extracted.cargo_product,
      cargo_specification: injectedPayload?.specification || injectedPayload?.especificacion || injectedPayload?.cargo_specification || specification || extracted.cargo_specification,
    }, analysisText);
    CRITICAL_FIELDS.forEach(([field]) => {
      if ((!scenario[field] || missingFields.includes(field)) && manualValues[field]) {
        scenario[field] = field.includes("rate") || field === "cargo_qty"
          ? parsePositiveNumber(manualValues[field])
          : manualValues[field];
      }
    });

    const missing = CRITICAL_FIELDS.filter(([field]) => !scenario[field]).map(([field]) => field);
    setManualValues((current) => ({ ...extracted, ...current }));
    setMissingFields(missing);

    if (missing.length || !hasMinimumVoyageRoute(scenario)) {
      const labels = CRITICAL_FIELDS.filter(([field]) => missing.includes(field)).map(([, label]) => label);
      showValidationAlert(`Faltan los datos mínimos de ruta: ${labels.join(", ")}.`);
      return { applied: false, reason: "missing-route", missing };
    }
    if (scenario.cancelling < scenario.laydays) {
      setMissingFields(["cancelling"]);
      showValidationAlert("Cancelling no puede ser anterior a Laydays.");
      return { applied: false, reason: "invalid-laycan" };
    }
    setPortWarning(scenario.port_validation?.clarification || "");

    setMissingFields([]);
    const polPort = scenario.pol_port
      ? await resolveAndSelectWpiPort(scenario.pol_port, "map-port-pol")
      : await typeIntoControl("map-port-pol", scenario.pol);
    const podPort = scenario.pod_port
      ? await resolveAndSelectWpiPort(scenario.pod_port, "map-port-pod")
      : await typeIntoControl("map-port-pod", scenario.pod);
    window.VoyageDraftStore?.getState?.().applyNlpScenario?.(scenario);
    if (!polPort || !podPort) showValidationAlert("Revisa POL y POD en los desplegables antes de calcular la ruta.");
    await typeIntoControl("map-laycan-date", scenario.laydays);
    await typeIntoControl("map-cancelling-date", scenario.cancelling);
    await typeIntoControl("cargo-qty", scenario.cargo_qty);
    if (scenario.cargo_category) await typeIntoControl("cargo-type", scenario.cargo_category);
    if (scenario.cargo_product) await typeIntoControl("cargo-product", scenario.cargo_product);
    if (scenario.cargo_specification) await typeIntoControl("cargo-type-manual", scenario.cargo_specification);
    if (scenario.dwt > 0) await typeIntoControl("vessel-dwt", scenario.dwt);

    const specificationLabel = specificationOptions.find((option) => option.value === scenario.cargo_specification)?.label || scenario.especificacionCarga || "";
    const hasOperationalRates = scenario.loading_rate > 0 || scenario.discharge_rate > 0;
    const optimizedMethods = hasOperationalRates
      ? optimizeCargoHandlingMethods(
        scenario.cargo_category,
        scenario.cargo_product,
        specificationLabel,
        scenario.loading_rate,
        scenario.discharge_rate,
      )
      : null;
    scenario.loadMethod = scenario.methodPOL || optimizedMethods?.pol.value || "";
    scenario.dischargeMethod = scenario.methodPOD || optimizedMethods?.pod.value || "";
    if (scenario.loadMethod) await typeIntoControl("metodo_carga", scenario.loadMethod);
    if (scenario.dischargeMethod) await typeIntoControl("metodo_descarga_pod", scenario.dischargeMethod);
    await typeIntoControl("laytime-load-condition", scenario.loading_terms);
    await typeIntoControl("laytime-disch-condition", scenario.discharge_terms);

    window.setRitmoMode?.("manual", "pol", { commit: true, deferCalculations: true });
    window.setRitmoMode?.("manual", "pod", { commit: true, deferCalculations: true });
    await typeIntoControl("rate-load", scenario.loading_rate);
    await typeIntoControl("rate-disch", scenario.discharge_rate);

    if (!scenario.is_partial) {
      window.syncCalculatorAndMatching?.("calculator", { force: true });
      window.syncMatchingViewFromGlobalOperationalState?.();
    }
    const previousOperationalState = window.SeaCharterStore?.getState?.() || {};
    const operationalPayload = {
      ...previousOperationalState,
      ...(scenario.is_partial ? {
        pol: scenario.pol,
        pod: scenario.pod,
        laydays: scenario.laydays,
        cancelling: scenario.cancelling,
        cargoQuantity: scenario.cargo_qty,
        cargoProduct: scenario.cargo_type,
      } : (window.readValidatedCargoOperationState?.() || {})),
      ...(scenario.loadMethod ? { loadMethod: scenario.loadMethod } : {}),
      ...(scenario.dischargeMethod ? { dischargeMethod: scenario.dischargeMethod } : {}),
      ...(scenario.loading_rate > 0 ? {
        loadRate: scenario.loading_rate,
        ritmoRealPol: scenario.loading_rate,
      } : {}),
      ...(scenario.discharge_rate > 0 ? {
        dischargeRate: scenario.discharge_rate,
        dischRate: scenario.discharge_rate,
        ritmoRealPod: scenario.discharge_rate,
      } : {}),
      ...(scenario.dwt > 0 ? { dwt: scenario.dwt, vesselDwt: scenario.dwt } : {}),
      ...(scenario.loadMethod ? { methodPOL: scenario.loadMethod } : {}),
      ...(scenario.dischargeMethod ? { methodPOD: scenario.dischargeMethod } : {}),
      ...(scenario.loading_rate > 0 ? { ratePOL: scenario.loading_rate, ritmoMode: "manual", ritmoMode_pol: "manual" } : {}),
      ...(scenario.discharge_rate > 0 ? { ratePOD: scenario.discharge_rate, ritmoMode_pod: "manual", podCalcMode: "manual" } : {}),
      laytimeLoadCondition: scenario.loading_terms,
      laytimeDischCondition: scenario.discharge_terms,
      laytimePOL: scenario.laytimePOL,
      laytimePOD: scenario.laytimePOD,
      cargoCategory: scenario.cargo_category,
      cargoProduct: scenario.cargo_product || scenario.cargo_type,
      cargoSpecification: scenario.cargo_specification,
    };
    window.SeaCharterStore?.set?.(operationalPayload, { force: true, source: "nlp-input-widget" });
    if (scenario.loadMethod) await typeIntoControl("metodo_carga", scenario.loadMethod);
    if (scenario.dischargeMethod) await typeIntoControl("metodo_descarga_pod", scenario.dischargeMethod);
    if (scenario.loading_rate > 0) {
      window.setRitmoMode?.("manual", "pol", { commit: true, deferCalculations: true });
      await typeIntoControl("rate-load", scenario.loading_rate);
    }
    if (scenario.discharge_rate > 0) {
      window.setRitmoMode?.("manual", "pod", { commit: true, deferCalculations: true });
      await typeIntoControl("rate-disch", scenario.discharge_rate);
    }
    if (scenario.port_validation?.valid) {
      await window.runOnDemandMapRouteWorkflow?.(document.getElementById("btn-map-locate-route"));
      await window.handleMasterValidationAndCalculate?.();
    }
    const usesPortCrane = optimizedMethods?.pol.equipment === "port-crane"
      || optimizedMethods?.pod.equipment === "port-crane";
    window.showToast?.(
      !scenario.port_validation?.valid
        ? "Datos extraídos. Selecciona los puertos pendientes en el desplegable WPI."
        : scenario.is_partial
        ? "Ruta preliminar generada. Laycan provisional, carga 0/TBA y términos CQD aplicados."
        : usesPortCrane
        ? "Escenario generado con métodos optimizados por capacidad y OPEX."
        : "Escenario generado con Grúa Barco para minimizar el OPEX.",
      false,
      scenario.port_validation?.valid ? "success" : "warning",
    );
    return {
      applied: true,
      routeCalculated: Boolean(scenario.port_validation?.valid),
      requiresPortSelection: !scenario.port_validation?.valid,
      scenario,
    };
  };

  analyzeAndDispatchRef.current = analyzeAndDispatch;

  useEffect(() => {
    const engine = Object.freeze({
      execute: (payload) => analyzeAndDispatchRef.current?.(payload),
      inject: (payload) => analyzeAndDispatchRef.current?.(payload),
      analyzeAndDispatch: (payload) => analyzeAndDispatchRef.current?.(payload),
      getStatus: () => ({ ready: true, mode: "headless" }),
    });
    window.SeaCharterNlpEngine = engine;
    window.dispatchEvent(new CustomEvent("seacharter:nlp-engine-ready"));
    return () => {
      if (window.SeaCharterNlpEngine === engine) delete window.SeaCharterNlpEngine;
    };
  }, []);

  return (
    <section
      className="map-floating-panel route-sync-card ecosystem-panel space-y-4"
      style={{ display: "none" }}
      aria-hidden="true"
      aria-label="Motor NLP"
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase text-[#002060]">
            <i className="fa-solid fa-wand-magic-sparkles mr-2" aria-hidden="true" /> Motor NLP
          </h2>
          <button
            type="button"
            className="map-icon-button !w-8 !h-8 !shadow-none"
            title={isNlpEngineOpen ? "Colapsar panel" : "Expandir panel"}
            aria-label={isNlpEngineOpen ? "Colapsar Motor NLP" : "Expandir Motor NLP"}
            aria-expanded={isNlpEngineOpen}
            onClick={() => setIsNlpEngineOpen((current) => !current)}
          >
            <i className={`fa-solid ${isNlpEngineOpen ? "fa-chevron-up" : "fa-chevron-down"} text-xs`} />
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Interpreta el requerimiento y alimenta los mismos campos manuales de DraftVoyage.
        </p>
      </div>

      {isNlpEngineOpen && (
        <div className="space-y-3">
          <div className="input-group">
            <label htmlFor="nlp-scenario-request">Requerimiento</label>
            <textarea
              id="nlp-scenario-request"
              className="input-gc"
              rows={5}
              value={requestText}
              onChange={(event) => {
                setRequestText(event.target.value);
                setMissingFields([]);
                setManualValues({});
                setPortWarning("");
              }}
              placeholder="Pega aquí el requerimiento del viaje"
            />
          </div>

          <div className="input-group">
            <label htmlFor="nlp-cargo-category">Categoría de Carga</label>
            <select
              id="nlp-cargo-category"
              className="input-gc action-required-field required-use-highlight text-action-required bg-white text-gray-800"
              style={{ colorScheme: "light" }}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setProduct("");
              }}
            >
              {categoryOptions.map((option) => (
                <option className="bg-white text-gray-800" key={option.value || option.label} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="nlp-cargo-product">Producto Específico</label>
            <select
              id="nlp-cargo-product"
              className="input-gc action-required-field required-use-highlight text-action-required bg-white text-gray-800"
              style={{ colorScheme: "light" }}
              value={product}
              onChange={(event) => setProduct(event.target.value)}
            >
              <option className="bg-white text-gray-800" value="">Selecciona un producto</option>
              {productOptions.map((option) => (
                <option className="bg-white text-gray-800" key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="nlp-cargo-specification">Especificación Carga</label>
            <select
              id="nlp-cargo-specification"
              className="input-gc action-required-field required-use-highlight text-action-required font-bold cursor-pointer bg-white text-gray-800"
              style={{ colorScheme: "light" }}
              value={specification}
              onChange={(event) => setSpecification(event.target.value)}
            >
              {specificationOptions.map((option) => (
                <option className="bg-white text-gray-800" key={option.value || option.label} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {missingFields.length > 0 && (
            <div className="flex items-center p-2 mt-2 text-red-700 bg-red-100 border border-red-300 rounded text-sm font-semibold shadow-sm" role="alert" aria-live="polite">
              Completa manualmente POL y POD para poder calcular la ruta.
            </div>
          )}

          {portWarning && (
            <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm font-semibold text-amber-800" role="alert" aria-live="polite">
              <i className="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
              <span>{portWarning}</span>
            </div>
          )}

          {CRITICAL_FIELDS.filter(([field]) => missingFields.includes(field)).map(([field, label, type]) => (
            <div className="input-group" key={field}>
              <label htmlFor={`nlp-manual-${field}`}>{label}</label>
              <input
                id={`nlp-manual-${field}`}
                className="input-gc"
                type={type}
                min={type === "number" ? "0" : undefined}
                step={type === "number" ? "any" : undefined}
                value={manualValues[field] || ""}
                onChange={(event) => setManualValues((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))}
              />
            </div>
          ))}

          <button
            type="button"
            className="btn-light-action w-full text-xs font-bold py-2 rounded"
            onClick={() => analyzeAndDispatch()}
          >
            <i className="fa-solid fa-wand-magic-sparkles mr-1" aria-hidden="true" /> Analizar y Generar Escenario
          </button>
        </div>
      )}
    </section>
  );
}

export {
  extractScenario,
  getCargoHandlingProfile,
  normalizeScenarioPayload,
  optimizeCargoHandlingMethods,
  requestScenarioExtraction,
  resolveAndSelectWpiPort,
};
export default NLPInputWidget;
