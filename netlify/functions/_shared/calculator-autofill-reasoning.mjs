export function normalizeChatHistory(historial = []) {
  if (!Array.isArray(historial)) return [];
  return historial
    .slice(-12)
    .map((entry) => ({
      role: entry?.role === "assistant" ? "assistant" : "user",
      content: String(entry?.content || entry?.text || "").trim().slice(0, 2_000),
    }))
    .filter((entry) => entry.content);
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function firstNonEmptyText(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function parseOperationalRate(message, operation) {
  const normalized = String(message || "").toLocaleLowerCase("es");
  const numberPattern = "(\\d{1,3}(?:[.,\\s]\\d{3})+|\\d+(?:[.,]\\d+)?)";
  const operationPattern = operation === "load" ? "carga" : "descarga";
  const expressions = [
    new RegExp(`${numberPattern}\\s*(?:tm|mt|t|toneladas?)?(?:\\s*\\/\\s*d[ií]a)?\\s*(?:de\\s+)?${operationPattern}\\b`, "i"),
    new RegExp(`\\b${operationPattern}\\b\\s*(?:de|a|:)?\\s*${numberPattern}`, "i"),
  ];
  for (const expression of expressions) {
    const match = normalized.match(expression);
    const rawValue = match?.[1];
    if (!rawValue) continue;
    const compact = rawValue.replace(/\s/g, "");
    const normalizedNumber = /^[0-9]{1,3}([.,][0-9]{3})+$/.test(compact)
      ? compact.replace(/[.,]/g, "")
      : compact.replace(",", ".");
    const rate = Number(normalizedNumber);
    if (Number.isFinite(rate) && rate > 0) return Math.round(rate);
  }
  return 0;
}

function classifyVessel(requiredDwt) {
  if (requiredDwt < 15_000) return "Mini-Bulker";
  if (requiredDwt < 40_000) return "Handysize";
  if (requiredDwt < 65_000) return "Supramax";
  if (requiredDwt <= 84_999) return "Panamax";
  return "Capesize";
}

function deduceCargoMethod(cargoType, rate) {
  const cargo = String(cargoType || "").toLocaleLowerCase("es");
  const isBigBags = /big\s*bags?|sacos?|ensacad/.test(cargo);
  const isPalletized = /pallet|palet|unitiz|unitariz|envasad/.test(cargo);
  const isSteel = /hierro|acero|sider/.test(cargo);
  const exceptionallyHigh = isBigBags
    ? rate > 2_000
    : isPalletized
      ? rate > 1_600
      : isSteel
        ? rate > 1_800
        : rate > 2_500;
  if (isBigBags) {
    return exceptionallyHigh
      ? { value: "big_bags_portuaria", label: "Big Bags - Grúa Portuaria", family: "Grúa Portuaria" }
      : { value: "big_bags_barco", label: "Big Bags - Grúa Barco", family: "Grúas del Barco" };
  }
  if (isPalletized) {
    return exceptionallyHigh
      ? { value: "paletizado_portuaria", label: "Paletizado - Grúa Portuaria", family: "Grúa Portuaria" }
      : { value: "paletizado_barco", label: "Paletizado - Grúa Barco", family: "Grúas del Barco" };
  }
  if (isSteel) {
    return exceptionallyHigh
      ? { value: "hierro_acero_portuaria", label: "Hierro/Acero - Grúa Portuaria", family: "Grúa Portuaria" }
      : { value: "hierro_acero_barco", label: "Hierro/Acero - Grúa Barco", family: "Grúas del Barco" };
  }
  return exceptionallyHigh
    ? { value: "cuchara_portuaria", label: "Cuchara (Grab) - Grúa Portuaria", family: "Grúa Portuaria" }
    : { value: "cuchara_grab", label: "Cuchara (Grab) - Grúa Barco", family: "Grúas del Barco" };
}

export function buildCalculatorAutofillAction(mensaje = "", contexto = {}) {
  const loadingRate = parseOperationalRate(mensaje, "load");
  const dischargeRate = parseOperationalRate(mensaje, "discharge");
  if (!loadingRate || !dischargeRate) return null;

  const draftVoyage = contexto?.draftVoyage || {};
  const cargoQuantity = firstPositiveNumber(
    draftVoyage.cantidadMT,
    contexto?.datosModulo?.cargoQuantity,
    contexto?.operativos?.carga?.cantidadMT,
  );
  const cargoType = firstNonEmptyText(
    draftVoyage.tipoCarga,
    contexto?.operativos?.carga?.tipo,
    contexto?.datosModulo?.cargoType,
  );
  if (!cargoQuantity || !cargoType) return null;

  const requiredDwt = Math.ceil((cargoQuantity * 1.1) / 100) * 100;
  const vesselClass = classifyVessel(requiredDwt);
  const loadingMethod = deduceCargoMethod(cargoType, loadingRate);
  const dischargeMethod = deduceCargoMethod(cargoType, dischargeRate);
  const methodSummary = loadingMethod.family === dischargeMethod.family
    ? loadingMethod.family
    : `${loadingMethod.family} en POL y ${dischargeMethod.family} en POD`;

  return {
    type: "calculator_autofill",
    pol: firstNonEmptyText(draftVoyage.POL, contexto?.operativos?.puertos?.POL),
    pod: firstNonEmptyText(draftVoyage.POD, contexto?.operativos?.puertos?.POD),
    cargo_qty: cargoQuantity,
    cargo_type: cargoType,
    loading_rate: loadingRate,
    discharge_rate: dischargeRate,
    required_dwt: requiredDwt,
    vessel_class: vesselClass,
    loading_method: loadingMethod,
    discharge_method: dischargeMethod,
    dwt_margin_pct: 10,
    method_summary: methodSummary,
  };
}
