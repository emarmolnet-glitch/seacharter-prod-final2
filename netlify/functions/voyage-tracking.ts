import type { Config, Context } from "@netlify/functions";
import { getPool } from "../../db/index.js";

type TrackingRow = Record<string, unknown>;

const CONTRACT_REF_PATTERN = /^[A-Z0-9][A-Z0-9/_-]{7,79}$/;
const EARTH_RADIUS_NM = 3440.065;

function errorResponse(status: number, error: string) {
  return Response.json({ success: false, error }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeContractRef(value: unknown) {
  let decoded = String(value ?? "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return "";
  }
  const normalized = decoded.trim().replace(/^REF:\s*/i, "").toUpperCase();
  return CONTRACT_REF_PATTERN.test(normalized) ? normalized : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hoursBetween(start: unknown, end: unknown = Date.now()) {
  const startDate = start ? new Date(String(start)) : null;
  const endDate = end ? new Date(String(end)) : null;
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 3_600_000);
}

function haversineNm(fromLat: unknown, fromLon: unknown, toLat: unknown, toLon: unknown) {
  const coordinates = [fromLat, fromLon, toLat, toLon].map(numberOrNull);
  if (coordinates.some((coordinate) => coordinate === null)) return null;
  const [lat1, lon1, lat2, lon2] = coordinates as number[];
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function readAisNumber(rawData: unknown, keys: string[]) {
  if (!rawData || typeof rawData !== "object") return null;
  const source = rawData as Record<string, unknown>;
  for (const key of keys) {
    const direct = numberOrNull(source[key]);
    if (direct !== null) return direct;
    const nested = source.Message && typeof source.Message === "object"
      ? numberOrNull((source.Message as Record<string, unknown>)[key])
      : null;
    if (nested !== null) return nested;
  }
  return null;
}

function calculatePhase(row: TrackingRow, distancePolNm: number | null, distancePodNm: number | null) {
  if (row.closed_at || row.discharge_completed_at) return 6;
  if (row.discharge_started_at) return 6;
  if (row.nor_pod_tendered_at || (distancePodNm !== null && distancePodNm <= 3)) return 5;
  if (row.loading_completed_at) return 4;
  if (row.loading_started_at || Number(row.cargo_loaded_mt) > 0) return 3;
  if (row.nor_pol_tendered_at || row.laytime_started_at) return 2;
  if (distancePolNm !== null && distancePolNm <= 3) return 2;
  return 1;
}

function milestoneStatus(phase: number, currentPhase: number, completed: boolean) {
  if (completed || phase < currentPhase) return "complete";
  if (phase === currentPhase) return "active";
  return "pending";
}

function buildAlert(code: string, level: "ok" | "warning" | "critical", title: string, detail: string) {
  return { code, level, title, detail };
}

function buildTrackingResponse(row: TrackingRow, events: TrackingRow[]) {
  const aisLatitude = numberOrNull(row.ais_latitude);
  const aisLongitude = numberOrNull(row.ais_longitude);
  const distancePolNm = haversineNm(aisLatitude, aisLongitude, row.origin_latitude, row.origin_longitude);
  const distancePodNm = haversineNm(aisLatitude, aisLongitude, row.destination_latitude, row.destination_longitude);
  const currentPhase = calculatePhase(row, distancePolNm, distancePodNm);
  const cargoTotal = numberOrNull(row.cargo_total_mt) ?? 0;
  const loaded = numberOrNull(row.cargo_loaded_mt) ?? 0;
  const discharged = numberOrNull(row.cargo_discharged_mt) ?? 0;
  const freeLaytimeHours = numberOrNull(row.free_laytime_hours) ?? 0;
  const laytimeEnd = row.discharge_completed_at || row.loading_completed_at || Date.now();
  const usedLaytimeHours = hoursBetween(row.laytime_started_at, laytimeEnd) ?? 0;
  const laytimeBalanceHours = freeLaytimeHours - usedLaytimeHours;
  const demurrageRate = numberOrNull(row.demurrage_rate_usd_day) ?? 0;
  const despatchRate = numberOrNull(row.despatch_rate_usd_day) ?? 0;
  const demurrageUsd = Math.max(0, -laytimeBalanceHours / 24 * demurrageRate);
  const despatchUsd = currentPhase >= 6 ? Math.max(0, laytimeBalanceHours / 24 * despatchRate) : 0;
  const loadingHours = hoursBetween(row.loading_started_at, row.loading_completed_at || Date.now());
  const dischargeHours = hoursBetween(row.discharge_started_at, row.discharge_completed_at || Date.now());
  const actualLoadRate = loadingHours && loadingHours > 0 ? loaded / loadingHours * 24 : null;
  const actualDischargeRate = dischargeHours && dischargeHours > 0 ? discharged / dischargeHours * 24 : null;
  const agreedLoadRate = numberOrNull(row.load_rate_mt_day);
  const agreedDischargeRate = numberOrNull(row.discharge_rate_mt_day);
  const eta = isoOrNull(row.dynamic_eta_at) || isoOrNull(row.ais_eta);
  const cancellingAt = isoOrNull(row.cancelling_at) || isoOrNull(row.laycan_end_at);
  const averageSpeed = numberOrNull(row.average_speed_knots)
    ?? readAisNumber(row.ais_raw_data, ["Sog", "sog", "speed", "SpeedOverGround"]);
  const remainingDistance = numberOrNull(row.remaining_distance_nm) ?? distancePodNm;
  const alerts = [];

  if (eta && cancellingAt) {
    const hoursToCancel = (new Date(cancellingAt).getTime() - new Date(eta).getTime()) / 3_600_000;
    if (hoursToCancel < 0) alerts.push(buildAlert("LAYCAN", "critical", "Riesgo de cancelación", `El ETA supera la cancelling date por ${Math.abs(hoursToCancel).toFixed(1)} h.`));
    else if (hoursToCancel <= 24) alerts.push(buildAlert("LAYCAN", "warning", "Ventana Laycan ajustada", `Margen estimado de ${hoursToCancel.toFixed(1)} h antes de cancelación.`));
    else alerts.push(buildAlert("LAYCAN", "ok", "Laycan protegido", `Margen estimado de ${hoursToCancel.toFixed(1)} h.`));
  } else {
    alerts.push(buildAlert("LAYCAN", "warning", "Laycan pendiente", "Falta ETA dinámico o cancelling date para completar la validación."));
  }

  if (!row.laytime_started_at || freeLaytimeHours <= 0) {
    alerts.push(buildAlert("LAYTIME", "warning", "Plancha sin base completa", "Pendiente de NOR aceptado o de horas libres contractuales."));
  } else if (laytimeBalanceHours < 0) {
    alerts.push(buildAlert("LAYTIME", "critical", "Demurrage activo", `${Math.abs(laytimeBalanceHours).toFixed(1)} h sobre plancha · USD ${demurrageUsd.toFixed(0)} estimados.`));
  } else if (usedLaytimeHours / freeLaytimeHours >= 0.8) {
    alerts.push(buildAlert("LAYTIME", "warning", "Plancha próxima a agotarse", `${laytimeBalanceHours.toFixed(1)} h libres restantes.`));
  } else {
    alerts.push(buildAlert("LAYTIME", "ok", "Plancha controlada", `${laytimeBalanceHours.toFixed(1)} h libres restantes.`));
  }

  const activeActualRate = currentPhase >= 6 ? actualDischargeRate : actualLoadRate;
  const activeAgreedRate = currentPhase >= 6 ? agreedDischargeRate : agreedLoadRate;
  if (activeActualRate !== null && activeAgreedRate && activeAgreedRate > 0) {
    const ratio = activeActualRate / activeAgreedRate;
    if (ratio < 0.8) alerts.push(buildAlert("PERFORMANCE", "critical", "Rendimiento crítico", `Ritmo real al ${(ratio * 100).toFixed(0)}% del pactado.`));
    else if (ratio < 0.95) alerts.push(buildAlert("PERFORMANCE", "warning", "Rendimiento bajo objetivo", `Ritmo real al ${(ratio * 100).toFixed(0)}% del pactado.`));
    else alerts.push(buildAlert("PERFORMANCE", "ok", "Rendimiento contractual", `Ritmo real al ${(ratio * 100).toFixed(0)}% del pactado.`));
  } else {
    alerts.push(buildAlert("PERFORMANCE", "warning", "Rendimiento pendiente", "Aún no hay suficiente actividad para calcular el ritmo real."));
  }

  const milestones = [
    { phase: 1, key: "pol_approach", title: "Aproximación POL", status: milestoneStatus(1, currentPhase, Boolean(row.nor_pol_tendered_at)), metrics: { distanceNm: distancePolNm, geofenceNm: 3, eta, cancellingAt } },
    { phase: 2, key: "nor_pol", title: "NOR POL", status: milestoneStatus(2, currentPhase, Boolean(row.loading_started_at)), metrics: { tenderedAt: isoOrNull(row.nor_pol_tendered_at), acceptedAt: isoOrNull(row.nor_pol_accepted_at), laytimeStartedAt: isoOrNull(row.laytime_started_at) } },
    { phase: 3, key: "loading", title: "Carga en POL", status: milestoneStatus(3, currentPhase, Boolean(row.loading_completed_at)), metrics: { loadedMt: loaded, totalMt: cargoTotal, actualRateMtDay: actualLoadRate, agreedRateMtDay: agreedLoadRate, demurrageUsd, despatchUsd } },
    { phase: 4, key: "passage", title: "Travesía", status: milestoneStatus(4, currentPhase, Boolean(row.nor_pod_tendered_at)), metrics: { remainingDistanceNm: remainingDistance, averageSpeedKnots: averageSpeed, eta } },
    { phase: 5, key: "pod_approach", title: "Aproximación y NOR POD", status: milestoneStatus(5, currentPhase, Boolean(row.discharge_started_at)), metrics: { distanceNm: distancePodNm, geofenceNm: 3, tenderedAt: isoOrNull(row.nor_pod_tendered_at), acceptedAt: isoOrNull(row.nor_pod_accepted_at) } },
    { phase: 6, key: "discharge_close", title: "Descarga en POD y Cierre", status: milestoneStatus(6, currentPhase, Boolean(row.closed_at)), metrics: { dischargedMt: discharged, totalMt: cargoTotal, actualRateMtDay: actualDischargeRate, agreedRateMtDay: agreedDischargeRate, portCostsUsd: numberOrNull(row.port_costs_usd) ?? 0, closedAt: isoOrNull(row.closed_at) } },
  ];

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    contract: {
      reference: `REF: ${row.contract_ref}`,
      vesselName: row.vessel_name || null,
      vesselMmsi: row.vessel_mmsi,
      cargoName: row.cargo_name || null,
      cargoTotalMt: cargoTotal,
      pol: { id: row.origin_port_id || null, name: row.origin_port_name || null },
      pod: { id: row.destination_port_id, name: row.destination_port_name || null },
      status: row.status,
    },
    live: {
      phase: currentPhase,
      position: aisLatitude !== null && aisLongitude !== null ? { latitude: aisLatitude, longitude: aisLongitude } : null,
      lastAisAt: isoOrNull(row.ais_last_seen_at),
      averageSpeedKnots: averageSpeed,
      remainingDistanceNm: remainingDistance,
      eta,
      laytime: { freeHours: freeLaytimeHours, usedHours: usedLaytimeHours, balanceHours: laytimeBalanceHours, demurrageUsd, despatchUsd },
    },
    milestones,
    alerts,
    timeline: events.map((event) => ({
      id: event.id,
      phase: Number(event.phase),
      type: event.event_type,
      status: event.status,
      summary: event.summary,
      value: numberOrNull(event.metric_value),
      unit: event.metric_unit || null,
      occurredAt: isoOrNull(event.occurred_at),
    })),
  };
}

export default async function voyageTrackingHandler(request: Request, context: Context) {
  if (request.method !== "GET") return errorResponse(405, "Método no permitido.");

  const pathnameRef = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
  const contractRef = normalizeContractRef(context.params?.contractRef || pathnameRef);
  if (!contractRef) return errorResponse(400, "La referencia de contrato no tiene un formato válido.");

  try {
    const result = await getPool().query<TrackingRow>(
      `SELECT
         v.*,
         cp.laycan_start_at,
         cp.laycan_end_at,
         cp.cancelling_at,
         cp.free_laytime_hours,
         cp.demurrage_rate_usd_day,
         cp.despatch_rate_usd_day,
         cp.load_rate_mt_day,
         cp.discharge_rate_mt_day,
         cp.nor_pol_tendered_at,
         cp.nor_pol_accepted_at,
         cp.laytime_started_at,
         cp.loading_started_at,
         cp.loading_completed_at,
         cp.nor_pod_tendered_at,
         cp.nor_pod_accepted_at,
         cp.discharge_started_at,
         cp.discharge_completed_at,
         ais.latitude AS ais_latitude,
         ais.longitude AS ais_longitude,
         ais.last_seen_at AS ais_last_seen_at,
         ais.raw_data AS ais_raw_data,
         ais.raw_data->>'eta' AS ais_eta
       FROM voyages v
       LEFT JOIN charter_parties cp ON cp.voyage_id = v.id
       LEFT JOIN LATERAL (
         SELECT latitude, longitude, last_seen_at, raw_data
         FROM ais_vessels
         WHERE mmsi = v.vessel_mmsi
         ORDER BY last_seen_at DESC
         LIMIT 1
       ) ais ON true
       WHERE upper(v.contract_ref) = $1
       LIMIT 1`,
      [contractRef],
    );

    const voyage = result.rows[0];
    if (!voyage) return errorResponse(404, "No existe un expediente operativo para esa referencia.");

    const events = await getPool().query<TrackingRow>(
      `SELECT id, phase, event_type, status, summary, metric_value, metric_unit, occurred_at
       FROM voyage_tracking_events
       WHERE voyage_id = $1
       ORDER BY occurred_at DESC
       LIMIT 30`,
      [voyage.id],
    );

    return Response.json(buildTrackingResponse(voyage, events.rows), {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[voyage-tracking] Tracking query failed.", error);
    return errorResponse(500, "No fue posible recuperar el seguimiento operativo.");
  }
}

export const config: Config = {
  path: "/api/v1/voyage/tracking/:contractRef",
};
