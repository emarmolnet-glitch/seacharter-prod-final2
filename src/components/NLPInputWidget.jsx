import React, { useEffect, useMemo, useRef, useState } from "react";

const CARGO_PRODUCTS = Object.freeze({
  "Minerales y Construcción": ["Cemento a granel", "Clínker", "Yeso"],
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
  ["laydays", "Laydays (Inicio)", "date"],
  ["cancelling", "Cancelación (Cancelling)", "date"],
  ["cargo_qty", "Carga a Transportar (TM)", "number"],
  ["loading_rate", "Ritmo Real POL (TM/d)", "number"],
  ["discharge_rate", "Ritmo Real POD (TM/d)", "number"],
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
  const normalizePortRecord = (port) => {
    if (!port || port.source !== "WPI") return null;
    const latitude = Number(port.latitude);
    const longitude = Number(port.longitude);
    if (!port.officialLabel || !port.countryCode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { ...port, latitude, longitude, source: "WPI" };
  };
  const portValidation = payload?.port_validation || source.port_validation || null;
  return {
    pol: cleanCapture(source.pol ?? source.port_of_loading ?? source.loading_port ?? ""),
    pod: cleanCapture(source.pod ?? source.port_of_discharge ?? source.discharge_port ?? ""),
    laydays: normalizeDate(source.laydays ?? source.layday ?? source.laycan_start ?? ""),
    cancelling: normalizeDate(source.cancelling ?? source.canceling ?? source.laycan_end ?? ""),
    cargo_qty: parsePositiveNumber(source.cargo_qty ?? source.cargoQty ?? source.quantity ?? source.qty ?? ""),
    loading_rate: parsePositiveNumber(source.loading_rate ?? source.loadingRate ?? source.load_rate ?? ""),
    discharge_rate: parsePositiveNumber(source.discharge_rate ?? source.dischargeRate ?? source.disch_rate ?? ""),
    pol_port: normalizePortRecord(source.pol_port),
    pod_port: normalizePortRecord(source.pod_port),
    port_validation: {
      valid: portValidation?.valid === true,
      clarification: cleanCapture(portValidation?.clarification || ""),
    },
  };
}

async function requestScenarioExtraction(text) {
  try {
    const response = await fetch("/api/nlp-voyage-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`NLP voyage extraction HTTP ${response.status}`);
    return normalizeScenarioPayload(await response.json());
  } catch (error) {
    console.warn("NLP voyage endpoint unavailable; WPI validation is required.", error);
    return {
      ...normalizeScenarioPayload(extractScenario(text)),
      port_validation: {
        valid: false,
        clarification: "No se pudo consultar el catálogo WPI. Inténtalo de nuevo antes de inyectar el viaje.",
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
  const [panelStyle, setPanelStyle] = useState({ visibility: "hidden" });
  const sectionRef = useRef(null);

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

  useEffect(() => {
    const sourcePanel = document.getElementById("map-input-overlay");
    const shell = document.getElementById("map-command-shell");
    if (!sourcePanel || !shell) return undefined;

    const alignWithSource = () => {
      const isGeoInputOpen = !shell.classList.contains("input-collapsed");
      const isMobileLayout = window.matchMedia("(max-width: 767px)").matches;
      const top = isMobileLayout && isGeoInputOpen
        ? sourcePanel.offsetTop + sourcePanel.offsetHeight + 12
        : sourcePanel.offsetTop;
      const left = isMobileLayout || !isGeoInputOpen
        ? sourcePanel.offsetLeft
        : sourcePanel.offsetLeft + sourcePanel.offsetWidth + 16;
      sectionRef.current?.style.setProperty("top", `${top}px`, "important");
      sectionRef.current?.style.setProperty("left", `${left}px`, "important");
      sectionRef.current?.style.setProperty("right", "auto", "important");
      sectionRef.current?.style.setProperty("width", `${sourcePanel.offsetWidth}px`, "important");
      sectionRef.current?.style.setProperty(
        "max-height",
        isMobileLayout
          ? `max(10rem, calc(100% - ${top + 116}px))`
          : `${sourcePanel.offsetHeight}px`,
        "important",
      );
      setPanelStyle({
        visibility: "visible",
      });
    };

    alignWithSource();
    const resizeObserver = new ResizeObserver(alignWithSource);
    resizeObserver.observe(sourcePanel);
    resizeObserver.observe(shell);
    const collapseObserver = new MutationObserver(alignWithSource);
    collapseObserver.observe(shell, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", alignWithSource);
    return () => {
      resizeObserver.disconnect();
      collapseObserver.disconnect();
      window.removeEventListener("resize", alignWithSource);
    };
  }, []);

  const showValidationAlert = (message) => {
    if (typeof window.showToast === "function") window.showToast(message, false, "error");
  };

  const analyzeAndDispatch = async () => {
    if (!requestText.trim()) {
      showValidationAlert("Introduce un requerimiento para analizar.");
      return;
    }

    const extracted = await requestScenarioExtraction(requestText);
    const scenario = {
      ...extracted,
      cargo_category: category,
      cargo_product: product,
      cargo_specification: specification,
    };
    CRITICAL_FIELDS.forEach(([field]) => {
      if ((!scenario[field] || missingFields.includes(field)) && manualValues[field]) {
        scenario[field] = field.includes("rate") || field === "cargo_qty"
          ? parsePositiveNumber(manualValues[field])
          : manualValues[field];
      }
    });

    const missing = CRITICAL_FIELDS.filter(([field]) => !scenario[field]).map(([field]) => field);
    const missingSelections = [
      ["cargo_category", "Categoría de Carga"],
      ["cargo_product", "Producto Específico"],
      ["cargo_specification", "Especificación Carga"],
    ].filter(([field]) => !scenario[field]);
    setManualValues((current) => ({ ...extracted, ...current }));
    setMissingFields(missing);

    if (missing.length || missingSelections.length) {
      const labels = CRITICAL_FIELDS.filter(([field]) => missing.includes(field)).map(([, label]) => label);
      const selectionLabels = missingSelections.map(([, label]) => label);
      showValidationAlert(`Faltan datos críticos: ${[...labels, ...selectionLabels].join(", ")}.`);
      return;
    }
    if (scenario.cancelling < scenario.laydays) {
      setMissingFields(["cancelling"]);
      showValidationAlert("Cancelling no puede ser anterior a Laydays.");
      return;
    }
    if (
      !scenario.port_validation?.valid
      || scenario.pol !== scenario.pol_port?.officialLabel
      || scenario.pod !== scenario.pod_port?.officialLabel
    ) {
      showValidationAlert(
        scenario.port_validation?.clarification
        || "POL y POD deben coincidir con registros oficiales del índice WPI.",
      );
      return;
    }

    setMissingFields([]);
    const polPort = await resolveAndSelectWpiPort(scenario.pol_port, "map-port-pol");
    const podPort = await resolveAndSelectWpiPort(scenario.pod_port, "map-port-pod");
    if (!polPort || !podPort) {
      showValidationAlert("No se pudieron consolidar POL y POD mediante la base WPI.");
      return;
    }
    await typeIntoControl("map-laycan-date", scenario.laydays);
    await typeIntoControl("map-cancelling-date", scenario.cancelling);
    await typeIntoControl("cargo-qty", scenario.cargo_qty);
    await typeIntoControl("cargo-type", category);
    await typeIntoControl("cargo-product", product);
    await typeIntoControl("cargo-type-manual", specification);

    const specificationLabel = specificationOptions.find((option) => option.value === specification)?.label || "";
    const optimizedMethods = optimizeCargoHandlingMethods(
      category,
      product,
      specificationLabel,
      scenario.loading_rate,
      scenario.discharge_rate,
    );
    scenario.loadMethod = optimizedMethods.pol.value;
    scenario.dischargeMethod = optimizedMethods.pod.value;
    await typeIntoControl("metodo_carga", scenario.loadMethod);
    await typeIntoControl("metodo_descarga_pod", scenario.dischargeMethod);

    window.setRitmoMode?.("manual", "pol", { commit: true, deferCalculations: true });
    window.setRitmoMode?.("manual", "pod", { commit: true, deferCalculations: true });
    await typeIntoControl("rate-load", scenario.loading_rate);
    await typeIntoControl("rate-disch", scenario.discharge_rate);

    window.syncCalculatorAndMatching?.("calculator", { force: true });
    window.syncMatchingViewFromGlobalOperationalState?.();
    const operationalPayload = {
      ...(window.readValidatedCargoOperationState?.() || {}),
      loadMethod: scenario.loadMethod,
      dischargeMethod: scenario.dischargeMethod,
    };
    window.SeaCharterStore?.set?.(operationalPayload, { force: true, source: "nlp-input-widget" });
    await window.runOnDemandMapRouteWorkflow?.(document.getElementById("btn-map-locate-route"));
    const usesPortCrane = optimizedMethods.pol.equipment === "port-crane"
      || optimizedMethods.pod.equipment === "port-crane";
    window.showToast?.(
      usesPortCrane
        ? "Escenario generado con métodos optimizados por capacidad y OPEX."
        : "Escenario generado con Grúa Barco para minimizar el OPEX.",
      false,
      "success",
    );
  };

  return (
    <section
      ref={sectionRef}
      className="map-floating-panel route-sync-card ecosystem-panel space-y-4"
      style={panelStyle}
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
              required
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
              required
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
              required
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
              Completa manualmente los datos críticos que no se pudieron extraer.
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
            onClick={analyzeAndDispatch}
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
