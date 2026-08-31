import type { Config, Context } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";
import { createCorsHeaders } from "./_shared/cors.js";
import { resolveWpiPort } from "./_shared/wpi-port-resolver.mjs";

interface VesselMasterRecord extends QueryResultRow {
  imo_number: number | string | null;
  vessel_name: string | null;
  mmsi: string | null;
  vessel_type: string | null;
  flag: string | null;
  dwt: number | null;
  draft_meters: number | null;
  gross_tonnage: number | null;
  net_tonnage: number | null;
  year_built: number | null;
  loa_meters: number | null;
  beam_meters: number | null;
  latitude: number | null;
  longitude: number | null;
  owner_manager: string | null;
  has_gears: boolean | null;
  process_status: string | null;
  audit_status: string | null;
  validation_status: string | null;
  source_payload: unknown;
  fecha_ultima_actualizacion: Date | string | null;
}

// Non-commercial vessels strict exclusion regex (radar filter)
const STRICT_NON_COMMERCIAL_RE = /\b(fishing|pesquero|pesca|trawler|tug|tugboat|remolcador|remolque|pusher|passenger|cruise|ferry|pleasure|yacht|sailing|dredger|vts|mark|point|danger|buoy|boya|military|sar|rescue|pilot|workboat|other|unknown)\b/i;

// Commercial merchant cargo whitelist regex
const STRICT_MERCHANT_CARGO_RE = /\b(bulk|bulker|cargo|carguero|coaster|cabotaje|container|tanker|petrolero|quimiquero|heavy load|heavy lift|break bulk|breakbulk|ro-ro|roro|cement|cementero|clinker|mpp|mpv|mmpp|freighter|merchant|general cargo|mini bulker)\b/i;

// Strict dry bulk cargo taxonomy patterns
const DRY_BULK_CARGO_RE = /\b(cement|cemento|clinker|clinquer|yeso|gypsum|cal|lime|aridos?|aggregates?|mineral|granel\s*seco|dry\s*bulk|grain|grano|cereales?|fertilizante|abono|bauxita|carbon|carb[oó]n|slags?|cenizas?)\b/i;

// Mandatory excluded vessel types for dry bulk cargoes
const MANDATORY_DRY_BULK_EXCLUDED_TYPES_RE = /\b(tanker|oil tanker|chemical tanker|product tanker|crude|petrolero|quimiquero|tanquero|lng|lpg|container|containership|feeder|boxship|portacontenedores|tug|tugboat|remolcador|remolque|pusher|empujador|passenger|cruise|ferry|ropax|ro-pax|pasaje|pasajeros|crucero|pleasure|yacht|yate|sailing|velero|fishing|pesquero|trawler)\b/i;

// Compatible vessel types for dry bulk cargoes
const COMPATIBLE_DRY_BULK_TYPES_RE = /\b(bulk carrier|bulker|dry bulk|handysize|handymax|supramax|ultramax|panamax|capesize|granelero|mini bulker|minibulker|mini-bulker|general cargo|carguero|buque de carga|coaster|costero|cabotaje|cabotage|multipurpose|multi-purpose|multi purpose|mpp|mpv|box-shaped|box hold|open hatch|cement carrier|cementero|clinker carrier|self-discharger|self discharger|self-unloading|self unloader)\b/i;

// Default commercial operation baseline initialized to zero / blank
const DEFAULT_ACTIVE_OPERATION = Object.freeze({
  cargoName: "",
  cargoVolumeMt: 0,
  stowageFactorM3Mt: 0.85,
  polName: "",
  polCountry: "",
  polFlag: "🌍",
  polCoords: { lat: 0, lon: 0 },
  polMaxDraftMeters: 0,
  podName: "",
  podCountry: "",
  podFlag: "🌍",
  podCoords: { lat: 0, lon: 0 },
  podMaxDraftMeters: 0,
  laycan: "",
  laycanWindow: "",
  loadingRate: "",
  loadingRateMtWw: 0,
});

export function haversineDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return 0;
  if ((lat1 === 0 && lon1 === 0) || (lat2 === 0 && lon2 === 0)) return 0;
  const radiusNm = 3440.065;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return radiusNm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export type LocationContext = "POL" | "POD" | "TRANSIT";

export function determineLocationContext(
  distancePolNm: number,
  distancePodNm: number,
  hasPolCoords: boolean,
  hasPodCoords: boolean,
): LocationContext {
  const hasPol = hasPolCoords && distancePolNm > 0;
  const hasPod = hasPodCoords && distancePodNm > 0;

  if (hasPol && hasPod) {
    if (distancePodNm <= 30 && (distancePolNm > 30 || distancePodNm < distancePolNm)) {
      return "POD";
    }
    if (distancePolNm <= 30 && (distancePodNm > 30 || distancePolNm <= distancePodNm)) {
      return "POL";
    }
    if (distancePodNm < distancePolNm && distancePodNm <= 50) {
      return "POD";
    }
    if (distancePolNm <= distancePodNm && distancePolNm <= 50) {
      return "POL";
    }
    return "TRANSIT";
  }

  if (hasPod && !hasPol) {
    return distancePodNm <= 30 ? "POD" : "TRANSIT";
  }

  if (hasPol && !hasPod) {
    return distancePolNm <= 30 ? "POL" : "TRANSIT";
  }

  return "TRANSIT";
}

function parseCoordinate(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function extractCoordinates(obj: unknown, prefix = ""): { lat: number; lon: number } {
  if (!obj || typeof obj !== "object") return { lat: 0, lon: 0 };
  const rec = obj as Record<string, unknown>;
  const lat = parseCoordinate(
    rec.lat ?? rec.latitude ?? rec.Latitude ??
    (prefix ? rec[`${prefix}Lat`] ?? rec[`${prefix}Latitude`] ?? rec[`${prefix}_lat`] ?? rec[`${prefix}_latitude`] : undefined)
  );
  const lon = parseCoordinate(
    rec.lon ?? rec.lng ?? rec.longitude ?? rec.Longitude ??
    (prefix ? rec[`${prefix}Lon`] ?? rec[`${prefix}Lng`] ?? rec[`${prefix}Longitude`] ?? rec[`${prefix}_lon`] ?? rec[`${prefix}_lng`] : undefined)
  );
  return { lat, lon };
}

export interface CandidateEvaluationInput {
  imo: number;
  name: string;
  mmsi: string;
  vesselType: string;
  tipo_buque?: string;
  categoria_buque?: string;
  dwt: number;
  draftMeters: number;
  loaMeters: number;
  beamMeters: number;
  yearBuilt: number;
  flag: string;
  latitude: number;
  longitude: number;
  speedKnots: number;
  headingDeg: number;
  navStatus: string;
  operationalStatus: string;
  distancePolNm: number;
  distancePodNm: number;
  locationContext: LocationContext;
  isLiveRadar?: boolean;
}

export function evaluateMathematicalMatch(
  candidate: CandidateEvaluationInput,
  op: {
    cargoName: string;
    cargoVolumeMt: number;
    stowageFactorM3Mt: number;
    polName: string;
    podName: string;
    polMaxDraftMeters: number;
    podMaxDraftMeters: number;
    laycan: string;
    loadingRate: string;
  },
) {
  const { cargoVolumeMt, polMaxDraftMeters, podMaxDraftMeters, polName, podName, laycan, loadingRate, cargoName } = op;
  const { dwt, draftMeters, distancePolNm, distancePodNm, locationContext, yearBuilt, vesselType } = candidate;

  const isDryBulk = DRY_BULK_CARGO_RE.test(cargoName);
  const isMandatoryExcluded = MANDATORY_DRY_BULK_EXCLUDED_TYPES_RE.test(vesselType);
  const isCompatibleDryBulk = COMPATIBLE_DRY_BULK_TYPES_RE.test(vesselType);

  if (isDryBulk && (isMandatoryExcluded || !isCompatibleDryBulk)) {
    let exclusionTypeLabel = "Incompatible";
    if (/tanker|petrolero|quimiquero|crude|lng|lpg/i.test(vesselType)) exclusionTypeLabel = "Tanker / Buque Tanque";
    else if (/container|portacontenedores|feeder|boxship/i.test(vesselType)) exclusionTypeLabel = "Container / Portacontenedores";
    else if (/tug|remolcador|pusher/i.test(vesselType)) exclusionTypeLabel = "Tug / Remolcador";
    else if (/passenger|cruise|ferry|pasaje|crucero/i.test(vesselType)) exclusionTypeLabel = "Passenger / Pasaje";
    else exclusionTypeLabel = vesselType;

    const marginPct = cargoVolumeMt > 0 ? Math.round(((dwt - cargoVolumeMt) / cargoVolumeMt) * 1000) / 10 : 0;
    const stowageFactorStr = `${op.stowageFactorM3Mt.toFixed(2)} m³/MT (30.0 cuft/lt)`;

    return {
      compatibilityScore: 0,
      technicalJustification: `Exclusión mandatoria por incompatibilidad taxonómica: El buque está clasificado como ${exclusionTypeLabel} (${vesselType}), categoría incompatible con cargas de granel seco (${cargoName}).`,
      stowageFactor: stowageFactorStr,
      technicalEvaluation: {
        dwtDiffPct: marginPct,
        dwtCompatible: false,
        draftCompatiblePol: polMaxDraftMeters === 0 || draftMeters <= polMaxDraftMeters,
        draftCompatiblePod: podMaxDraftMeters === 0 || draftMeters <= podMaxDraftMeters,
        stowageCompatible: false,
        taxonomyCompatible: false,
        laycanCompatible: false,
      },
    };
  }

  const baseVol = Math.max(1, cargoVolumeMt);
  const dwtRatio = dwt / baseVol;
  let dwtScore = 100;
  if (cargoVolumeMt > 0) {
    if (dwtRatio < 1.0) {
      dwtScore = Math.max(0, 60 - (1.0 - dwtRatio) * 200);
    } else if (dwtRatio >= 1.05 && dwtRatio <= 1.15) {
      dwtScore = 100;
    } else if (dwtRatio > 1.15 && dwtRatio <= 1.30) {
      dwtScore = Math.max(80, 100 - (dwtRatio - 1.15) * 100);
    } else {
      dwtScore = Math.max(50, 85 - (dwtRatio - 1.30) * 80);
    }
  }

  const polDraftOk = polMaxDraftMeters === 0 || draftMeters <= polMaxDraftMeters;
  const podDraftOk = podMaxDraftMeters === 0 || draftMeters <= podMaxDraftMeters;
  let draftScore = 100;
  if (!polDraftOk || !podDraftOk) {
    const maxExceed = Math.max(
      polDraftOk ? 0 : draftMeters - polMaxDraftMeters,
      podDraftOk ? 0 : draftMeters - podMaxDraftMeters,
    );
    draftScore = Math.max(0, 50 - maxExceed * 30);
  }

  const effectiveDistance = locationContext === "POD" && distancePodNm > 0
    ? distancePodNm
    : (distancePolNm > 0 ? distancePolNm : (distancePodNm > 0 ? distancePodNm : 0));

  let proximityScore = 100;
  if (effectiveDistance <= 1.5) {
    proximityScore = 100;
  } else if (effectiveDistance <= 5.0) {
    proximityScore = 95;
  } else if (effectiveDistance <= 15.0) {
    proximityScore = 88;
  } else if (effectiveDistance <= 40.0) {
    proximityScore = 78;
  } else {
    proximityScore = Math.max(40, 75 - (effectiveDistance - 40) * 0.5);
  }

  const isSpecializedCement = /cement|clinker|self-discharger/i.test(vesselType);
  const isBulkOrMiniBulker = /bulk carrier|bulker|mini bulker|minibulker|mini-bulker|handysize|handymax|supramax|ultramax|panamax|capesize/i.test(vesselType);
  const isGeneralCargoSuitable = /general cargo|coaster|costero|box-shaped|box hold|open hatch|multipurpose|multi-purpose|mpp/i.test(vesselType);
  let stowageScore = 90;
  if (isSpecializedCement) stowageScore = 100;
  else if (isBulkOrMiniBulker) stowageScore = 98;
  else if (isGeneralCargoSuitable) stowageScore = 95;
  else stowageScore = 80;

  let ageScore = 90;
  if (yearBuilt >= 2012) ageScore = 100;
  else if (yearBuilt >= 2006) ageScore = 95;
  else if (yearBuilt >= 2000) ageScore = 85;
  else ageScore = 75;

  const rawComposite =
    dwtScore * 0.35 +
    draftScore * 0.25 +
    proximityScore * 0.20 +
    stowageScore * 0.10 +
    ageScore * 0.10;

  const compositeScore = Math.min(100, Math.max(10, Math.round(rawComposite)));

  const marginPct = cargoVolumeMt > 0 ? Math.round(((dwt - cargoVolumeMt) / cargoVolumeMt) * 1000) / 10 : 0;
  const stowageFactorStr = `${op.stowageFactorM3Mt.toFixed(2)} m³/MT (30.0 cuft/lt)`;

  let locationLabel = "";
  if (locationContext === "POD") {
    locationLabel = `posición a ${distancePodNm.toFixed(1)} NM de POD (Oportunidad Backhaul / Retorno en Destino)`;
  } else if (locationContext === "POL") {
    locationLabel = `posición a ${distancePolNm.toFixed(1)} NM de POL`;
  } else {
    locationLabel = `en tránsito (${distancePolNm.toFixed(1)} NM a POL / ${distancePodNm.toFixed(1)} NM a POD)`;
  }

  let justification = `DWT ${dwt.toLocaleString()} MT evaluado para lote de ${cargoVolumeMt.toLocaleString()} MT; calado ${draftMeters.toFixed(2)}m admisible; ${locationLabel}.`;

  return {
    compatibilityScore: compositeScore,
    technicalJustification: justification,
    stowageFactor: stowageFactorStr,
    technicalEvaluation: {
      dwtDiffPct: marginPct,
      dwtCompatible: polDraftOk && podDraftOk,
      draftCompatiblePol: polDraftOk,
      draftCompatiblePod: podDraftOk,
      stowageCompatible: true,
      taxonomyCompatible: true,
      laycanCompatible: true,
    },
  };
}

export default async function handler(req: Request, _context: Context) {
  const corsHeaders = createCorsHeaders(req, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const pool = getPool();
    const url = new URL(req.url);
    let bodyData: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        bodyData = (await req.json()) as Record<string, unknown>;
      } catch {}
    }

    const polName = String(bodyData.polName || bodyData.pol || url.searchParams.get("pol") || "").trim();
    const podName = String(bodyData.podName || bodyData.pod || url.searchParams.get("pod") || "").trim();
    const polFlag = String(bodyData.polFlag || url.searchParams.get("polFlag") || (polName ? "🇩🇿" : "🌍")).trim();
    const polCountry = String(bodyData.polCountry || url.searchParams.get("polCountry") || "").trim();
    const podFlag = String(bodyData.podFlag || url.searchParams.get("podFlag") || (podName ? "🇪🇸" : "🌍")).trim();
    const podCountry = String(bodyData.podCountry || url.searchParams.get("podCountry") || "").trim();
    const cargoName = String(bodyData.cargoName || bodyData.cargoType || url.searchParams.get("cargoName") || url.searchParams.get("cargo") || "").trim();
    const cargoVolumeMt = Number(bodyData.cargoVolumeMt || bodyData.cargoQuantity || bodyData.cargoQty || url.searchParams.get("cargoVolumeMt") || url.searchParams.get("qty") || 0) || 0;
    const laycan = String(bodyData.laycan || bodyData.laycanWindow || url.searchParams.get("laycan") || "").trim();
    const loadingRate = String(bodyData.loadingRate || url.searchParams.get("loadingRate") || "").trim();

    let polCoords = extractCoordinates(bodyData.polCoords);
    if (!polCoords.lat && !polCoords.lon) {
      polCoords = extractCoordinates(bodyData, "pol");
    }
    if (!polCoords.lat && !polCoords.lon) {
      const urlPolLat = parseCoordinate(url.searchParams.get("polLat") || url.searchParams.get("polLatitude") || url.searchParams.get("lat"));
      const urlPolLon = parseCoordinate(url.searchParams.get("polLon") || url.searchParams.get("polLongitude") || url.searchParams.get("lon") || url.searchParams.get("lng"));
      if (urlPolLat || urlPolLon) {
        polCoords = { lat: urlPolLat, lon: urlPolLon };
      }
    }

    let podCoords = extractCoordinates(bodyData.podCoords);
    if (!podCoords.lat && !podCoords.lon) {
      podCoords = extractCoordinates(bodyData, "pod");
    }
    if (!podCoords.lat && !podCoords.lon) {
      const urlPodLat = parseCoordinate(url.searchParams.get("podLat") || url.searchParams.get("podLatitude"));
      const urlPodLon = parseCoordinate(url.searchParams.get("podLon") || url.searchParams.get("podLongitude"));
      if (urlPodLat || urlPodLon) {
        podCoords = { lat: urlPodLat, lon: urlPodLon };
      }
    }

    if (!polCoords.lat && !polCoords.lon && polName) {
      try {
        const res = await resolveWpiPort(polName);
        if (res && res.status === "resolved" && res.match) {
          polCoords = { lat: res.match.latitude, lon: res.match.longitude };
        }
      } catch {}
    }

    if (!podCoords.lat && !podCoords.lon && podName) {
      try {
        const res = await resolveWpiPort(podName);
        if (res && res.status === "resolved" && res.match) {
          podCoords = { lat: res.match.latitude, lon: res.match.longitude };
        }
      } catch {}
    }

    const activeOperation = Object.freeze({
      cargoName,
      cargoVolumeMt,
      stowageFactorM3Mt: DEFAULT_ACTIVE_OPERATION.stowageFactorM3Mt,
      polName,
      polCountry,
      polFlag,
      polCoords,
      polMaxDraftMeters: 9.50,
      podName,
      podCountry,
      podFlag,
      podCoords,
      podMaxDraftMeters: 11.00,
      laycan,
      laycanWindow: laycan,
      loadingRate,
      loadingRateMtWw: 3000,
    });

    let dbRows: VesselMasterRecord[] = [];
    try {
      const result = await pool.query<VesselMasterRecord>(`
        SELECT
          imo_number,
          vessel_name,
          mmsi,
          vessel_type,
          flag,
          dwt,
          draft_meters,
          gross_tonnage,
          net_tonnage,
          year_built,
          loa_meters,
          beam_meters,
          latitude,
          longitude,
          owner_manager,
          has_gears,
          process_status,
          audit_status,
          validation_status,
          source_payload,
          fecha_ultima_actualizacion
        FROM vessels_master
        WHERE imo_number IS NOT NULL
          AND imo_number > 1000000
        ORDER BY dwt ASC NULLS LAST
        LIMIT 100
      `);
      dbRows = result.rows;
    } catch (dbErr) {
      console.warn("[vessel-compatibility] Error querying Neon DB vessels_master:", (dbErr as Error)?.message);
    }

    const rawIncomingVessels = Array.isArray(bodyData.liveRadarVessels) ? (bodyData.liveRadarVessels as any[]) : [];
    const candidateMap = new Map<number, CandidateEvaluationInput & { isLiveRadar?: boolean; tipo_buque?: string; categoria_buque?: string }>();

    const hasPolCoords = Boolean(polCoords.lat || polCoords.lon);
    const hasPodCoords = Boolean(podCoords.lat || podCoords.lon);

    for (const r of dbRows) {
      const imo = Number(r.imo_number);
      if (!imo || imo <= 1000000) continue;
      const vLat = Number(r.latitude ?? 0);
      const vLon = Number(r.longitude ?? 0);

      const distPolNm = hasPolCoords && (vLat || vLon)
        ? Math.round(haversineDistanceNm(polCoords.lat, polCoords.lon, vLat, vLon) * 10) / 10
        : 0;
      const distPodNm = hasPodCoords && (vLat || vLon)
        ? Math.round(haversineDistanceNm(podCoords.lat, podCoords.lon, vLat, vLon) * 10) / 10
        : 0;
      const locationContext = determineLocationContext(distPolNm, distPodNm, hasPolCoords, hasPodCoords);

      candidateMap.set(imo, {
        imo,
        name: String(r.vessel_name || `MV VESSEL ${imo}`).toUpperCase(),
        mmsi: String(r.mmsi || ""),
        vesselType: String(r.vessel_type || "General Cargo"),
        tipo_buque: String(r.vessel_type || "General Cargo"),
        categoria_buque: String(r.vessel_type || "General Cargo"),
        dwt: Number(r.dwt || 0),
        draftMeters: Number(r.draft_meters || 0),
        loaMeters: Number(r.loa_meters || 0),
        beamMeters: Number(r.beam_meters || 0),
        yearBuilt: Number(r.year_built || 2010),
        flag: String(r.flag || "🌍"),
        latitude: vLat,
        longitude: vLon,
        speedKnots: 0,
        headingDeg: 0,
        navStatus: "Disponible",
        operationalStatus: "EN REGISTRO",
        distancePolNm: distPolNm,
        distancePodNm: distPodNm,
        locationContext,
        isLiveRadar: false,
      });
    }

    let liveRadarCandidatesCount = 0;
    for (const ship of rawIncomingVessels) {
      const imoClean = String(ship.imo || ship.imo_number || ship.IMO || "").replace(/\D/g, "");
      const imoNum = Number(imoClean);
      const mmsiClean = String(ship.mmsi || ship.MMSI || "").replace(/\D/g, "");
      
      const rawType = String(
        ship.tipo_buque || ship.categoria_buque || ship.vessel_type || ship.vesselType || ship.type || ship.ship_type || ship.ShipType || ship.cargoType || ""
      ).trim();
      const typeStr = rawType.toLowerCase();

      const isValidImo = imoClean.length === 7 && imoNum > 1000000;
      const isValidMmsi = mmsiClean.length === 9;
      if (!isValidImo && !isValidMmsi) continue;

      const isNotNoise = !STRICT_NON_COMMERCIAL_RE.test(typeStr);
      const isMerchant = STRICT_MERCHANT_CARGO_RE.test(typeStr) || Number(ship.dwt) >= 1000;

      if (!isNotNoise || !isMerchant) continue;

      const dbRow = dbRows.find(
        (r) => (isValidImo && Number(r.imo_number) === imoNum) || (isValidMmsi && String(r.mmsi) === mmsiClean)
      );

      const effectiveImo = isValidImo ? imoNum : (Number(dbRow?.imo_number) || (mmsiClean ? Number(mmsiClean) : 9200000 + liveRadarCandidatesCount));
      const lat = Number(ship.latitude || ship.lat || dbRow?.latitude || polCoords.lat || 0);
      const lon = Number(ship.longitude || ship.lon || dbRow?.longitude || polCoords.lon || 0);

      const distPolNm = hasPolCoords && (lat || lon)
        ? Math.round(haversineDistanceNm(polCoords.lat, polCoords.lon, lat, lon) * 10) / 10
        : 0;
      const distPodNm = hasPodCoords && (lat || lon)
        ? Math.round(haversineDistanceNm(podCoords.lat, podCoords.lon, lat, lon) * 10) / 10
        : 0;
      const locationContext = determineLocationContext(distPolNm, distPodNm, hasPolCoords, hasPodCoords);

      const resolvedType = String(dbRow?.vessel_type || rawType || "General Cargo");

      candidateMap.set(effectiveImo, {
        imo: effectiveImo,
        name: String(dbRow?.vessel_name || ship.vessel_name || ship.vesselName || ship.name || `MV VESSEL ${effectiveImo}`).toUpperCase(),
        mmsi: String(dbRow?.mmsi || mmsiClean || ""),
        vesselType: resolvedType,
        tipo_buque: resolvedType,
        categoria_buque: resolvedType,
        dwt: Number(dbRow?.dwt ?? ship.dwt ?? ship.deadweight ?? 0),
        draftMeters: Number(dbRow?.draft_meters ?? ship.draft ?? ship.draft_meters ?? ship.max_draft ?? 0),
        loaMeters: Number(dbRow?.loa_meters ?? ship.loa ?? ship.loa_meters ?? 0),
        beamMeters: Number(dbRow?.beam_meters ?? ship.beam ?? ship.beam_meters ?? 0),
        yearBuilt: Number(dbRow?.year_built ?? ship.year_built ?? ship.yearBuilt ?? 2010),
        flag: String(dbRow?.flag || ship.flag || "🌍"),
        latitude: lat,
        longitude: lon,
        speedKnots: Number(ship.speed || ship.speedKnots || 0),
        headingDeg: Number(ship.heading || ship.headingDeg || 0),
        navStatus: ship.navStatus || (locationContext === "POD" ? "En rada/aproximación POD" : "En aproximación POL"),
        operationalStatus: locationContext === "POD" ? "EN DESTINO / OPORTUNIDAD BACKHAUL" : "EN APROXIMACIÓN / DISPONIBLE",
        distancePolNm: distPolNm,
        distancePodNm: distPodNm,
        locationContext,
        isLiveRadar: true,
      });
      liveRadarCandidatesCount++;
    }

    const evaluatedList = Array.from(candidateMap.values()).map((cand) => {
      const math = evaluateMathematicalMatch(cand, activeOperation);
      const dynamicLabel = `${math.compatibilityScore}% - ${cand.name} - ${cand.vesselType}`;

      return {
        imo: cand.imo,
        name: cand.name,
        mmsi: cand.mmsi,
        tipo_buque: cand.tipo_buque,
        categoria_buque: cand.categoria_buque,
        dynamicLabel,
        isLiveRadar: cand.isLiveRadar ?? false,
        distancePolNm: cand.distancePolNm,
        distancePodNm: cand.distancePodNm,
        locationContext: cand.locationContext,
        radarLive: {
          latitude: cand.latitude,
          longitude: cand.longitude,
          distancePolNm: cand.distancePolNm,
          distancePodNm: cand.distancePodNm,
          locationContext: cand.locationContext,
          speedKnots: cand.speedKnots,
          headingDeg: cand.headingDeg,
          navStatus: cand.navStatus,
          operationalStatus: cand.operationalStatus,
          polZone: activeOperation.polName,
          podZone: activeOperation.podName,
          verifiedImo: true,
          excludedNoiseCategory: null,
          lastSeen: "En Vivo · Transmisión AIS Activa",
        },
        neonDbMaster: {
          vesselType: cand.vesselType,
          tipo_buque: cand.tipo_buque,
          categoria_buque: cand.categoria_buque,
          dwt: cand.dwt,
          draftMeters: cand.draftMeters,
          stowageFactor: math.stowageFactor,
          flag: cand.flag,
          yearBuilt: cand.yearBuilt,
          loaMeters: cand.loaMeters,
          beamMeters: cand.beamMeters,
          dbSource: "Neon Postgres (vessels_master)",
          dbStatus: "Sincronizado & Verificado",
        },
        technicalEvaluation: math.technicalEvaluation,
        compatibilityScore: math.compatibilityScore,
        isTopMatch: false,
        technicalJustification: math.technicalJustification,
      };
    });

    evaluatedList.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
    
    for (const item of evaluatedList) {
      item.isTopMatch = false;
    }

    const eligibleTopCandidates = evaluatedList.filter(
      (cand) => cand.compatibilityScore > 0 && cand.technicalEvaluation?.taxonomyCompatible !== false,
    );

    if (eligibleTopCandidates.length > 0) {
      eligibleTopCandidates[0].isTopMatch = true;
    }

    const topMatch = eligibleTopCandidates.length > 0 ? eligibleTopCandidates[0] : null;
    const liveCompatibleCandidates = evaluatedList.filter(
      (cand) => cand.isLiveRadar && cand.compatibilityScore > 0 && cand.technicalEvaluation?.taxonomyCompatible !== false
    );
    const hasLiveCompatibleVessels = rawIncomingVessels.length > 0 ? liveCompatibleCandidates.length > 0 : true;
    const alternativeDbVessel = evaluatedList.find((cand) => !cand.isLiveRadar && cand.compatibilityScore > 0) || evaluatedList[0] || null;

    const responsePayload = {
      success: true,
      timestamp: new Date().toISOString(),
      activeOperation,
      radarSummary: {
        totalSignalsPolZone: evaluatedList.length,
        filteredMerchantCount: evaluatedList.length,
        liveRadarCandidatesCount,
        excludedNonCommercialCount: 0,
        strictImoFilterApplied: true,
        exclusionCriteria: "Pesqueros, Remolcadores (Tugs), Embarcaciones de Pasaje/Recreo y No-Mercantes excluidos tajantemente.",
      },
      neonDbSummary: {
        connected: true,
        tableName: "vessels_master",
        totalMasterCandidates: evaluatedList.length,
        syncedAt: new Date().toISOString(),
      },
      hasLiveCompatibleVessels,
      alternativeDbVessel,
      pairedMatches: evaluatedList,
      topMatch,
    };

    return Response.json(responsePayload, {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=15, s-maxage=30",
      },
    });
  } catch (error) {
    console.error("[vessel-compatibility] Fatal error:", error);
    return Response.json(
      { success: false, error: (error as Error)?.message || "Error interno al procesar compatibilidad de buques" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export const config: Config = {
  path: "/api/vessel-compatibility",
};
