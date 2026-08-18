const SUPPORTED_MODULES = new Set([
  "map",
  "estimator",
  "decisiones",
  "tracking",
  "ais",
  "matching",
  "gencon",
  "auditor",
]);

function isMissing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  const normalized = String(value).trim().toLowerCase();
  return !normalized || normalized === "tba" || normalized === "--" || normalized === "desconocido";
}

function isPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function addIssue(issues, code, message, condition) {
  if (condition) issues.push({ code, message });
}

export function evaluateModuleSuggestions(moduleId, data = {}) {
  if (!SUPPORTED_MODULES.has(moduleId)) return { alerts: 0, issues: [] };

  const issues = [];
  const routeMissing = isMissing(data.pol) || isMissing(data.pod);

  switch (moduleId) {
    case "map":
      addIssue(issues, "route-fields", "Completa POL y POD para definir la ruta.", routeMissing);
      addIssue(issues, "route-calculation", "Calcula la ruta para validar distancias y restricciones.", !routeMissing && !isPositiveNumber(data.distanceNm));
      addIssue(issues, "laycan", "Revisa las fechas de laycan y cancelling.", isMissing(data.laycanStart) || isMissing(data.laycanEnd));
      break;
    case "estimator":
      addIssue(issues, "estimator-route", "Faltan puertos para completar la estimación.", routeMissing);
      addIssue(issues, "estimator-cargo", "Introduce la cantidad de carga para calcular costes unitarios.", !isPositiveNumber(data.cargoQuantity));
      addIssue(issues, "estimator-result", "Ejecuta el cálculo para obtener flete y TCE.", !isPositiveNumber(data.freightRate) && !isPositiveNumber(data.tce));
      break;
    case "decisiones":
      addIssue(issues, "decision-inputs", "Completa la operación base antes de evaluar decisiones.", routeMissing || !isPositiveNumber(data.cargoQuantity));
      addIssue(issues, "decision-analysis", "Genera el análisis de decisión para comparar escenarios.", !data.analysisReady);
      addIssue(issues, "decision-risk", "Hay riesgos operativos o comerciales pendientes de revisión.", Boolean(data.hasRisks));
      break;
    case "tracking":
      addIssue(issues, "tracking-vessel", "Selecciona un buque o contrato para iniciar el seguimiento.", !data.hasVessel && !data.hasContract);
      addIssue(issues, "tracking-route", "El tracking no tiene una ruta completa para contrastar el viaje.", !routeMissing && !isPositiveNumber(data.distanceNm));
      addIssue(issues, "tracking-position", "La posición AIS todavía no está validada.", (data.hasVessel || data.hasContract) && !data.positionUpdatedAt);
      break;
    case "ais":
      addIssue(issues, "density-route", "Define POL y POD para contextualizar la densidad AIS.", routeMissing);
      addIssue(issues, "density-scan", "Ejecuta el barrido de densidad para medir oferta y competencia.", !data.densityCalculated);
      addIssue(issues, "density-coefficient", "Falta calcular el coeficiente de oferta de la zona.", data.densityCalculated && !isPositiveNumber(data.supplyCoefficient));
      break;
    case "matching":
      addIssue(issues, "matching-criteria", "Completa ruta, laycan y carga para buscar coincidencias.", routeMissing || !isPositiveNumber(data.cargoQuantity) || isMissing(data.laycanStart) || isMissing(data.laycanEnd));
      addIssue(issues, "matching-validation", "Corrige los campos marcados por la validación del motor.", Boolean(data.validationMessage));
      addIssue(issues, "matching-results", "Ejecuta la búsqueda para obtener buques compatibles.", !data.validationMessage && !isPositiveNumber(data.resultCount));
      break;
    case "gencon":
      addIssue(issues, "editor-operation", "Completa los datos operativos esenciales del contrato.", routeMissing || !isPositiveNumber(data.cargoQuantity));
      addIssue(issues, "editor-laytime", "Revisa ritmos y términos de plancha antes de cerrar el contrato.", !isPositiveNumber(data.loadRate) || !isPositiveNumber(data.dischargeRate));
      addIssue(issues, "editor-status", "El contrato aún no figura como generado o aceptado.", !data.contractGenerated && !data.contractAccepted);
      break;
    case "auditor":
      addIssue(issues, "audit-contract", "Selecciona o genera un contrato antes de auditarlo.", !data.contractGenerated && isMissing(data.contractReference));
      addIssue(issues, "audit-report", "El contrato todavía no tiene un informe de auditoría.", !data.auditReportGenerated);
      addIssue(issues, "audit-risks", "Existen riesgos básicos que conviene contrastar en la auditoría.", Boolean(data.hasRisks));
      break;
    default:
      break;
  }

  return { alerts: issues.length, issues };
}

export { SUPPORTED_MODULES };
