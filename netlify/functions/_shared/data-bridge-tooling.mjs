import { getDatabase } from "netlify-database-client";

export const DATA_BRIDGE_DICTIONARY = Object.freeze({
  Market_Data: {
    bunker_prices_log: ["hub_name", "fuel_grade", "price"],
    market_spot_rates: ["index_name", "spot_rate", "daily_change_pct"],
    market_ffa_rates: ["vessel_class", "period", "rate_usd"],
  },
  Eficiencia_Mercado: {
    market_average_speeds: ["vessel_class", "average_speed_knots", "record_date"],
  },
  Vessel_Tracking: {
    ais_vessels: ["imo_number", "vessel_name", "latitude", "longitude", "destination", "speed", "status"],
    vessels_master: ["imo_number", "dwt", "vessel_type", "draft_meters", "has_gears"],
  },
  Port_Intelligence: {
    wpi: ["port_name", "country", "chan_depth", "cranefixed", "cranemobil", "pilot_reqd", "max_vessel"],
  },
  Commercial_Operations: {
    voyages_tracking: ["demurrage_usd", "route_progress_pct", "loading_rate_mt_day", "actual_loading_rate_mt_day"],
    pda_vessel_confirmations: ["financial_breakdown", "operational_validation"],
  },
});

export const DATA_BRIDGE_SYSTEM_PROMPT = `Eres el cerebro analítico de SeaCharter Core PRO. Tienes acceso a Data Bridge (Neon PostgreSQL). Tu base de datos contiene, entre otras, las siguientes entidades clave que puedes consultar usando herramientas (Tool Calling):
\`\`\`json
${JSON.stringify(DATA_BRIDGE_DICTIONARY)}
\`\`\`
Reglas de enrutamiento semántico:
- Usa vessels_master SOLAMENTE cuando el usuario proporcione un nombre de buque específico o un número IMO para consultar características técnicas como DWT, grúas o calado. Nunca uses vessels_master para calcular o responder promedios de mercado.
- Usa market_average_speeds SOLAMENTE cuando el usuario pregunte por "velocidad media", "promedio del mercado" o velocidades agrupadas por clase, por ejemplo Capesize, Panamax, Supramax o Handysize. Envía target="market_average_speeds" y vessel_class con la clase solicitada.
- Si el usuario pregunta por precios de bunker, índices de mercado, características técnicas de un puerto o posiciones de buques, consulta la entidad correspondiente de Data Bridge.
Si no tienes el dato en tu contexto inmediato, informa al usuario que vas a consultar la base de datos de Data Bridge y prepara el payload de búsqueda.`;

const TABLES = Object.freeze({
  bunker_prices_log: {
    select: "hub_name, fuel_grade, price::double precision AS price",
    search: ["hub_name", "fuel_grade"],
    orderBy: "created_at DESC, id DESC",
  },
  market_spot_rates: {
    select: "index_name, spot_rate::double precision AS spot_rate, daily_change_pct::double precision AS daily_change_pct",
    search: ["index_name"],
    orderBy: "record_date DESC, created_at DESC, id DESC",
  },
  market_ffa_rates: {
    select: "vessel_class, period, rate_usd::double precision AS rate_usd",
    search: ["vessel_class", "period"],
    orderBy: "record_date DESC, created_at DESC, id DESC",
  },
  market_average_speeds: {
    select: "average_speed_knots::double precision AS average_speed_knots",
    search: ["vessel_class"],
    orderBy: "record_date DESC NULLS LAST",
  },
  ais_vessels: {
    select: `imo_number, vessel_name, latitude, longitude,
      COALESCE(raw_data->>'destination', raw_data->>'Destination') AS destination,
      COALESCE(raw_data->>'speed', raw_data->>'Speed', raw_data->>'sog', raw_data->>'SOG') AS speed,
      COALESCE(raw_data->>'status', raw_data->>'Status', audit_status) AS status`,
    search: ["imo_number", "mmsi", "vessel_name"],
    orderBy: "last_seen_at DESC, updated_at DESC",
  },
  vessels_master: {
    select: "imo_number, dwt, vessel_type, draft_meters, has_gears",
    search: ["imo_number::text", "mmsi", "vessel_name", "vessel_type"],
    orderBy: "fecha_ultima_actualizacion DESC NULLS LAST, updated_at DESC",
  },
  wpi: {
    select: "port_name, country, chan_depth, cranefixed, cranemobil, pilot_reqd, max_vessel",
    search: ["port_name", "country"],
    orderBy: "port_name ASC",
  },
  voyages_tracking: {
    select: "demurrage_usd::double precision AS demurrage_usd, route_progress_pct::double precision AS route_progress_pct, loading_rate_mt_day::double precision AS loading_rate_mt_day, actual_loading_rate_mt_day::double precision AS actual_loading_rate_mt_day",
    search: ["contract_ref", "vessel_name", "imo_number", "pol_name", "pod_name"],
    orderBy: "updated_at DESC, created_at DESC",
  },
  pda_vessel_confirmations: {
    select: "financial_breakdown, operational_validation",
    search: ["estimation_id", "vessel_name", "imo_number", "pol", "pod"],
    orderBy: "created_at DESC",
  },
});

export const DATA_BRIDGE_TOOLS = [{
  functionDeclarations: [{
    name: "consultar_data_bridge",
    description: "Consulta una entidad permitida de Data Bridge. Usa vessels_master solo para un buque individual identificado por nombre o IMO y market_average_speeds solo para velocidades medias o promedios del mercado por clase.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          format: "enum",
          enum: Object.keys(TABLES),
          description: "Tabla objetivo. Usa vessels_master SOLAMENTE cuando el usuario proporcione un nombre de buque específico o un número IMO para consultar características técnicas (DWT, grúas, calado). Usa market_average_speeds SOLAMENTE cuando pregunte por velocidad media, promedio del mercado o velocidades agrupadas por clase (Capesize, Panamax, Supramax, Handysize).",
        },
        query: {
          type: "string",
          description: "Texto de búsqueda para las demás tablas, por ejemplo un puerto, hub, índice, IMO o nombre de buque. No lo uses para sustituir vessel_class al consultar market_average_speeds.",
        },
        vessel_class: {
          type: "string",
          description: "Clase de buque requerida al consultar market_average_speeds, por ejemplo Capesize, Panamax, Supramax o Handysize. No identifica un buque individual.",
        },
        limit: {
          type: "integer",
          description: "Número máximo de registros a devolver, entre 1 y 20.",
        },
      },
      required: ["target"],
    },
  }],
}];

export function buildDataBridgeQuery(payload = {}) {
  const requestedTarget = typeof payload.target === "string" ? payload.target : payload.table;
  const table = typeof requestedTarget === "string" ? requestedTarget : "";
  const tableConfig = TABLES[table];
  if (!tableConfig) throw new Error("Tabla de Data Bridge no permitida.");

  const requestedQuery = table === "market_average_speeds" && typeof payload.vessel_class === "string"
    ? payload.vessel_class
    : payload.query;
  const query = typeof requestedQuery === "string" ? requestedQuery.trim().slice(0, 160) : "";
  const requestedLimit = Number.parseInt(payload.limit, 10);
  const defaultLimit = table === "market_average_speeds" && query ? 1 : 10;
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 20) : defaultLimit;
  const params = [];
  let whereClause = "";

  if (query) {
    params.push(`%${query}%`);
    whereClause = ` WHERE ${tableConfig.search.map((column) => `${column} ILIKE $1`).join(" OR ")}`;
  }

  params.push(limit);
  return {
    table,
    query,
    text: `SELECT ${tableConfig.select} FROM ${table}${whereClause} ORDER BY ${tableConfig.orderBy} LIMIT $${params.length}`,
    params,
  };
}

export async function executeDataBridgeTool(functionCall, database) {
  if (!functionCall || functionCall.name !== "consultar_data_bridge") {
    return { success: false, error: "Herramienta de Data Bridge no reconocida." };
  }

  try {
    const dataBridge = database || getDatabase();
    const query = buildDataBridgeQuery(functionCall.args);
    const result = await dataBridge.pool.query(query.text, query.params);
    const marketAverageSpeed = query.table === "market_average_speeds"
      ? result.rows[0]?.average_speed_knots ?? null
      : undefined;
    return {
      success: true,
      source: "Data Bridge (Neon PostgreSQL)",
      table: query.table,
      query: query.query || null,
      count: result.rows.length,
      rows: result.rows,
      ...(query.table === "market_average_speeds" ? { value: marketAverageSpeed } : {}),
    };
  } catch (error) {
    console.error("[chat-assistant] Data Bridge tool failed", error);
    return {
      success: false,
      error: "No fue posible consultar Data Bridge en este momento.",
    };
  }
}
