import { getDatabase } from "netlify-database-client";

export const DATA_BRIDGE_DICTIONARY = Object.freeze({
  Market_Data: {
    bunker_prices_log: ["hub_name", "fuel_grade", "price"],
    market_spot_rates: ["index_name", "spot_rate", "daily_change_pct"],
    market_ffa_rates: ["vessel_class", "period", "rate_usd"],
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
Regla de comportamiento: Si el usuario te pregunta por precios de bunker, índices de mercado, características técnicas de un puerto (ej. si tiene grúas) o posiciones de buques, DEBES saber que esa información reside en tu Data Bridge. Si no tienes el dato en tu contexto inmediato, informa al usuario que vas a consultar la base de datos de Data Bridge y prepara el payload de búsqueda.`;

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
    description: "Consulta de forma segura una entidad permitida de Data Bridge (Neon PostgreSQL) para obtener datos marítimos actuales.",
    parameters: {
      type: "object",
      properties: {
        table: {
          type: "string",
          format: "enum",
          enum: Object.keys(TABLES),
          description: "Tabla concreta del diccionario dinámico que contiene la información solicitada.",
        },
        query: {
          type: "string",
          description: "Texto de búsqueda, por ejemplo un puerto, hub, índice, clase de buque, IMO o nombre de buque.",
        },
        limit: {
          type: "integer",
          description: "Número máximo de registros a devolver, entre 1 y 20.",
        },
      },
      required: ["table"],
    },
  }],
}];

export function buildDataBridgeQuery(payload = {}) {
  const table = typeof payload.table === "string" ? payload.table : "";
  const tableConfig = TABLES[table];
  if (!tableConfig) throw new Error("Tabla de Data Bridge no permitida.");

  const query = typeof payload.query === "string" ? payload.query.trim().slice(0, 160) : "";
  const requestedLimit = Number.parseInt(payload.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 20) : 10;
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
    return {
      success: true,
      source: "Data Bridge (Neon PostgreSQL)",
      table: query.table,
      query: query.query || null,
      count: result.rows.length,
      rows: result.rows,
    };
  } catch (error) {
    console.error("[chat-assistant] Data Bridge tool failed", error);
    return {
      success: false,
      error: "No fue posible consultar Data Bridge en este momento.",
    };
  }
}
