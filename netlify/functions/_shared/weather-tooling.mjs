function normalizePortName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getWeatherSnapshot(context = {}) {
  const candidates = [
    context.meteorologia,
    context.operativos?.meteorologia,
    context.draftVoyage?.weather,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) || null;
}

export const WEATHER_TOOLS = [{
  functionDeclarations: [{
    name: "getWeatherForecast",
    description: "Obtiene el pronóstico meteorológico disponible en SeaCharter para un puerto de la ruta actual. Úsalo cuando el usuario pregunte por clima, viento, lluvia, condiciones portuarias o impacto meteorológico en carga, descarga, demoras o laytime.",
    parameters: {
      type: "object",
      properties: {
        portName: {
          type: "string",
          description: "Nombre del puerto solicitado, por ejemplo Bejaia, Oran o Rotterdam. También admite POL o POD.",
        },
      },
      required: ["portName"],
    },
  }],
}];

export function getWeatherForecast(portName, context = {}) {
  const snapshot = getWeatherSnapshot(context);
  if (!snapshot) {
    return {
      success: false,
      error: "No hay datos meteorológicos cargados para la ruta actual.",
    };
  }

  const normalizedQuery = normalizePortName(portName);
  const ports = snapshot.ports && typeof snapshot.ports === "object" ? snapshot.ports : {};
  const requestedRole = normalizedQuery === "pol" || normalizedQuery === "pod" ? normalizedQuery : "";
  const match = Object.entries(ports).find(([role, forecast]) => {
    if (!forecast || typeof forecast !== "object") return false;
    if (requestedRole) return role.toLowerCase() === requestedRole;
    const normalizedForecastPort = normalizePortName(forecast.portName || forecast.name);
    return normalizedForecastPort === normalizedQuery
      || normalizedForecastPort.includes(normalizedQuery)
      || normalizedQuery.includes(normalizedForecastPort);
  });

  if (!match) {
    return {
      success: false,
      source: snapshot.source || null,
      availablePorts: Object.values(ports).map((forecast) => forecast?.portName).filter(Boolean),
      error: `No hay pronóstico disponible para ${String(portName || "el puerto solicitado").trim()}.`,
    };
  }

  const [role, forecast] = match;
  return {
    success: true,
    source: snapshot.source || null,
    mode: snapshot.mode || null,
    targetDate: snapshot.targetDate || null,
    laydays: snapshot.laydays || null,
    cancelling: snapshot.cancelling || null,
    daysUntilLaycan: Number.isFinite(snapshot.daysUntilLaycan) ? snapshot.daysUntilLaycan : null,
    role: role.toUpperCase(),
    forecast,
  };
}

export async function executeWeatherTool(functionCall, context = {}) {
  if (!functionCall || functionCall.name !== "getWeatherForecast") {
    return { success: false, error: "Herramienta meteorológica no reconocida." };
  }
  return getWeatherForecast(functionCall.args?.portName, context);
}
