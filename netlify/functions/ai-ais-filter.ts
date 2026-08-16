import type { Config } from "@netlify/functions";
import { calculateCargoIntelligenceBoost, estimateDwtFromDimensions, evaluateCargoVesselEligibility } from "../../cargo-taxonomy.mjs";
import { calculateTaxonomyTechnicalScore } from "./_shared/taxonomy-compatibility.mjs";
import { buildCommercialVesselRank, compareCommercialVesselRanks } from "./_shared/commercial-vessel-ranking.mjs";
import { overrideVesselClassesFromMaster } from "./_shared/verified-vessel-classes.js";

type AnyRecord = Record<string, unknown>;

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function pickObject(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function parseObject(value: unknown): AnyRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRecord;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return pickObject(JSON.parse(value));
  } catch {
    return {};
  }
}

function textValue(...values: unknown[]) {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== "");
  return value === undefined || value === null ? "" : String(value).trim();
}

const UNKNOWN_TECHNICAL_VALUES = new Set(["", "n/a", "na", "n/d", "n d", "nd", "unknown", "desconocido", "null", "undefined"]);

function isUnknownTechnicalValue(value: unknown) {
  return UNKNOWN_TECHNICAL_VALUES.has(normalizeTaxonomyText(value));
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function nullableNumberValue(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusNm = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radiusNm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function parseDateValue(value: unknown) {
  const text = textValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function normalizeTaxonomyText(value: unknown) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const taxonomyTerms: Record<string, string[]> = {
  "category:cargo": ["cargo", "bulk", "bulker", "general cargo", "container", "cement", "multipurpose", "mpp", "heavy lift", "coaster"],
  "type:bulk": ["bulk carrier", "bulk", "bulker", "handysize", "handymax", "supramax", "ultramax", "panamax", "capesize"],
  "type:general": ["general cargo", "coaster"],
  "type:container": ["container", "feeder"],
  "type:cement": ["cement", "cemento", "ciment", "clinker", "cemex", "holcim", "lafarge", "heidelberg", "buzzi", "votorantim", "argos", "portland"],
  "type:mpv": ["multipurpose", "mpp"],
  "type:heavy_lift": ["heavy lift"],
  "category:tanker": ["tanker", "crude", "lng", "lpg", "chemical", "product tanker", "oil"],
  "type:crude_tanker": ["crude", "oil tanker"],
  "type:lng_tanker": ["lng"],
  "type:chemical_tanker": ["chemical"],
  "type:product_tanker": ["product tanker"],
  "type:lpg_tanker": ["lpg"],
};

const cementConfirmedTerms = ["cement carrier", "cement", "cemento", "ciment", "clinker carrier", "clinker"];
const cementPossibleTerms = ["cem", "cementos", "cemex", "holcim", "lafarge", "heidelberg", "heidelbergcement", "buzzi", "votorantim", "argos", "calucem", "portland", "bulk cement", "terminal cemento", "cement terminal"];
const cementGenericCargoTerms = ["cargo", "general cargo", "bulk", "bulker", "bulk carrier", "carrier", "freighter"];

function classifyCementCarrierCandidate(vessel: NonNullable<ReturnType<typeof normalizeVessel>>) {
  const haystack = normalizeTaxonomyText([
    vessel.vesselName,
    vessel.shipType,
    vessel.destination,
    vessel.lastPortOfCall,
    vessel.source.Tipo,
    vessel.source.tipo,
    vessel.source.type,
    vessel.source.shipType,
    vessel.source.ShipType,
    vessel.source.vesselType,
    vessel.source.cargoType,
    vessel.source.tipo_carga,
    vessel.source.tipo_buque,
    vessel.source.cargoTaxonomyLabel,
    vessel.source.categoryLabel,
    vessel.source.categoryValue,
    vessel.source.radarCategory,
    vessel.source.vesselClass,
    pickObject(vessel.source.MetaData).ShipName,
    pickObject(vessel.source.MetaData).Tipo,
    pickObject(vessel.source.MetaData).tipo_carga,
    pickObject(vessel.source.MetaData).cargoType,
    pickObject(vessel.source.MetaData).vesselClass,
    pickObject(vessel.source.fleetIntelRecord).tipo_carga,
    pickObject(vessel.source.fleetIntelRecord).cargoType,
    pickObject(vessel.source.fleetIntelRecord).tipo,
    pickObject(vessel.source.fleetIntelRecord).type,
    pickObject(vessel.source.fleetIntelRecord).shipType,
    pickObject(vessel.source.fleetIntelRecord).vesselType,
    pickObject(vessel.source.fleetIntelRecord).categoryLabel,
    pickObject(vessel.source.fleetIntelRecord).scrapedType,
  ].filter(Boolean).join(" "));
  const confirmedReasons = cementConfirmedTerms.filter((term) => {
    const normalized = normalizeTaxonomyText(term);
    if (["cement", "cemento", "ciment", "clinker"].includes(normalized)) return new RegExp(`\\b${normalized}\\b`).test(haystack);
    return haystack.includes(normalized);
  });
  if (confirmedReasons.length > 0) return { level: "confirmed", label: "Cement Carrier", reasons: confirmedReasons };
  const possibleReasons = cementPossibleTerms.filter((term) => {
    const normalized = normalizeTaxonomyText(term);
    if (normalized === "cem") return /\bcem\b/.test(haystack) || /\bcem[a-z0-9]{2,}\b/.test(haystack);
    return haystack.includes(normalized);
  });
  const genericCargo = cementGenericCargoTerms.some((term) => haystack.includes(normalizeTaxonomyText(term)));
  if (possibleReasons.length > 0 && genericCargo) return { level: "possible", label: "Possible Cement Carrier", reasons: possibleReasons };
  return { level: "none", label: "", reasons: [] };
}

function vesselMatchesTaxonomy(vessel: NonNullable<ReturnType<typeof normalizeVessel>>, taxonomyValue: string) {
  if (!taxonomyValue || taxonomyValue === "All") return true;
  const cementSignal = classifyCementCarrierCandidate(vessel);
  if (taxonomyValue === "type:cement" && cementSignal.level !== "none") return true;
  const terms = taxonomyTerms[taxonomyValue] || taxonomyTerms[taxonomyValue.replace(/^type:/, "")] || [taxonomyValue.replace(/^type:/, "")];
  const haystack = normalizeTaxonomyText([
    vessel.shipType,
    vessel.source.Tipo,
    vessel.source.type,
    vessel.source.vesselType,
    vessel.source.cargoType,
    vessel.source.tipo_carga,
    vessel.source.tipo_buque,
    vessel.source.cargoClass,
    vessel.source.radarCategory,
    vessel.source.vesselClass,
  ].filter(Boolean).join(" "));
  return terms.some((term) => haystack.includes(normalizeTaxonomyText(term)));
}

function normalizeRequestedTaxonomies(value: unknown) {
  const candidates = Array.isArray(value) ? value : [value];
  return Array.from(new Set(candidates.map((item) => textValue(item)).filter(Boolean)));
}

function vesselMatchesAnyTaxonomy(vessel: NonNullable<ReturnType<typeof normalizeVessel>>, taxonomyValues: string[]) {
  if (taxonomyValues.length === 0) return true;
  return taxonomyValues.some((taxonomyValue) => vesselMatchesTaxonomy(vessel, taxonomyValue));
}

function normalizeVessel(value: unknown) {
  const input = pickObject(value);
  const sourcePayload = parseObject(input.source_payload || input.sourcePayload || input.rawData);
  const message = parseObject(input.Message || sourcePayload.Message);
  const meta = parseObject(input.MetaData || input.metadata || sourcePayload.MetaData || sourcePayload.metadata || message.MetaData);
  const position = parseObject(
    input.PositionReport
      || message.PositionReport
      || sourcePayload.PositionReport
      || input.StandardClassBPositionReport
      || message.StandardClassBPositionReport
      || sourcePayload.StandardClassBPositionReport
      || input.ExtendedClassBPositionReport
      || message.ExtendedClassBPositionReport
      || sourcePayload.ExtendedClassBPositionReport,
  );
  const staticData = parseObject(input.ShipStaticData || message.ShipStaticData || sourcePayload.ShipStaticData);
  const source: AnyRecord = {
    ...sourcePayload,
    ...input,
    Message: message,
    MetaData: meta,
    PositionReport: position,
    ShipStaticData: staticData,
  };

  const latitude = numberValue(source.latitude, source.lat, source.AIS_Live_Lat, sourcePayload.latitude, sourcePayload.lat, meta.latitude, meta.Latitude, meta.AIS_Live_Lat, position.Latitude, position.latitude);
  const longitude = numberValue(source.longitude, source.lon, source.lng, source.AIS_Live_Lon, sourcePayload.longitude, sourcePayload.lon, sourcePayload.lng, meta.longitude, meta.Longitude, meta.AIS_Live_Lon, position.Longitude, position.longitude);

  const hasValidPosition = Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && !(latitude === 0 && longitude === 0);

  const mmsi = textValue(source.mmsi, source.MMSI, meta.MMSI, position.UserID, staticData.UserID);
  const imo = textValue(source.imo, source.IMO, source.imoNumber, source.imo_number, meta.IMO, staticData.ImoNumber) || (mmsi ? "PENDING" : "");
  const vesselName = textValue(source.vesselName, source.vessel_name, source.ShipName, source.name, meta.ShipName, staticData.Name) || "Unknown vessel";
  const declaredShipType = textValue(
    source.ship_type,
    source.vessel_type,
    source.radarCategory,
    source.cargoClass,
    source.tipo_buque,
    source.tipo,
    source.shipType,
    source.ShipType,
    source.vesselClass,
    source.type,
    meta.radarCategory,
    meta.cargoClass,
    meta.ship_type,
    meta.vessel_type,
    meta.tipo_buque,
    meta.tipo,
    meta.ShipType,
    meta.shipType,
    staticData.Type,
  );
  const shipType = isUnknownTechnicalValue(declaredShipType) ? "Unknown" : declaredShipType;
  let dwt = numberValue(source.dwt, source.DWT, meta.dwt, meta.DWT, sourcePayload.dwt, sourcePayload.DWT);
  let dwtStatus = textValue(source.dwtStatus, source.dwt_status, meta.dwtStatus) || null;
  const isLiveRadarSource = /DATALASTIC|AIS_LIVE|NEON_(?:ACTIVE_SCAN|SCAN_RESULTS)/i.test(textValue(source.source, source.source_origin, source.sourceOrigin))
    || (Array.isArray(source.source_origins) && source.source_origins.some((origin) => /DATALASTIC|AIS_LIVE|NEON_(?:ACTIVE_SCAN|SCAN_RESULTS)/i.test(String(origin))));
  const draft = numberValue(source.draft, source.Draft, source.draft_meters, source.calado, meta.draft, meta.Draft, meta.calado, staticData.MaximumStaticDraught);
  const dimA = numberValue(staticData.DimensionA, source.DimensionA, meta.DimensionA);
  const dimB = numberValue(staticData.DimensionB, source.DimensionB, meta.DimensionB);
  const dimC = numberValue(staticData.DimensionC, source.DimensionC, meta.DimensionC);
  const dimD = numberValue(staticData.DimensionD, source.DimensionD, meta.DimensionD);
  const loa = numberValue(source.loa, source.LOA, source.eslora, source.length, meta.loa, meta.LOA, meta.eslora, meta.length, dimA + dimB > 0 ? dimA + dimB : 0);
  const beam = numberValue(source.beam, source.Beam, source.manga, source.width, meta.beam, meta.Beam, meta.manga, meta.width, dimC + dimD > 0 ? dimC + dimD : 0);

  if (!isLiveRadarSource && (!dwt || dwt <= 0) && loa > 0 && beam > 0 && draft > 0) {
    const estimated = estimateDwtFromDimensions(loa, beam, draft);
    if (estimated > 0) {
      dwt = estimated;
      dwtStatus = "ESTIMATED_BY_DIMENSIONS";
    }
  }
  if (dwt && dwt > 0 && !dwtStatus) dwtStatus = "SOURCE_REPORTED";

  const declaredSpeedInferenceSource = textValue(source.speedInferenceSource, meta.speedInferenceSource) || null;
  const sourceUsesMarketSpeed = declaredSpeedInferenceSource === "market_average_speeds";
  const reportedSpeed = sourceUsesMarketSpeed
    ? null
    : nullableNumberValue(source.speed_over_ground, source.speedOverGround, source.sog, source.SOG, source.speed, meta.speed_over_ground, meta.speedOverGround, meta.SOG, meta.speed, position.Sog, position.SOG);
  const marketAverageSpeedKnots = nullableNumberValue(
    source.marketAverageSpeedKnots,
    meta.marketAverageSpeedKnots,
    sourceUsesMarketSpeed ? source.speed_over_ground : null,
    sourceUsesMarketSpeed ? source.speed : null,
  );
  const speed = reportedSpeed ?? marketAverageSpeedKnots ?? 0;
  const speedInferenceSource = reportedSpeed === null && marketAverageSpeedKnots !== null
    ? "market_average_speeds"
    : declaredSpeedInferenceSource;
  const speedTelemetryAvailable = reportedSpeed !== null;
  const destination = textValue(source.destination, source.Destination, source.current_destination, meta.Destination, staticData.Destination, staticData.PortOfDestination) || "N/A";
  const declaredEta = textValue(source.eta, source.ETA, source.Eta, source.estimatedEta, source.etaEstimated, source.eta_calculado, meta.eta, meta.ETA, meta.Eta, meta.estimatedEta, meta.etaEstimated);
  const lastPortOfCall = textValue(source.lastPortOfCall, source.last_port_of_call, source.ultimo_puerto, source.LastPort, source.LastPortOfCall, source.PreviousPort, source.DeparturePort, meta.lastPortOfCall, meta.ultimo_puerto, meta.LastPort, meta.LastPortOfCall, meta.PreviousPort, meta.DeparturePort) || "N/A";
  const designDraft = nullableNumberValue(source.verifiedDesignDraft, source.verified_design_draft, source.designDraft, source.maxDraft, source.MaximumStaticDraught, meta.designDraft, meta.maxDraft, meta.MaximumStaticDraught);
  const sourceOrigins = (Array.isArray(source.source_origins) ? source.source_origins : Array.isArray(source.sourceOrigins) ? source.sourceOrigins : [])
    .map((origin) => textValue(origin))
    .filter(Boolean);
  const sourceOrigin = textValue(source.source_origin, source.sourceOrigin, source.data_source) || sourceOrigins.join(" + ") || "MASTER";
  const vesselKey = textValue(source.vessel_key, source.vesselKey);

  const longDistanceTransitToPol = source.longDistanceTransitToPol === true || meta.longDistanceTransitToPol === true;
  const commercialTransitCandidate = source.commercialTransitCandidate === true || meta.commercialTransitCandidate === true;
  const matchReason = textValue(source.matchReason, meta.matchReason) || null;
  const verifiedDwt = source.verifiedDwt === true || meta.verifiedDwt === true;
  const sourceDwtDifference = nullableNumberValue(source.dwtDifference, source.dwtDifferenceMt, meta.dwtDifference);
  const estimatedBallastStatus = source.estimatedBallastStatus === true || meta.estimatedBallastStatus === true;

  return { source, vesselName, mmsi, imo, shipType, dwt, dwtStatus, draft, designDraft, loa, beam, speed, marketAverageSpeedKnots, speedInferenceSource, speedTelemetryAvailable, destination, declaredEta, lastPortOfCall, latitude, longitude, hasValidPosition, longDistanceTransitToPol, commercialTransitCandidate, matchReason, verifiedDwt, sourceDwtDifference, estimatedBallastStatus, sourceOrigins, sourceOrigin, vesselKey, isLiveRadarSource };
}

function parseLaycanEnd(value: unknown) {
  const parsed = Date.parse(textValue(value));
  if (Number.isFinite(parsed)) return new Date(parsed + 24 * 60 * 60 * 1000);
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
}

function parseLaycanStart(value: unknown) {
  return parseDateValue(value) || new Date();
}

function inferLoadState(draft: number, designDraft: number | null, maxPortDraft: number) {
  if (draft <= 0) {
    return { state: "Unknown", ballastReady: false, score: 10, reason: "Sin calado AIS disponible" };
  }

  const ratio = designDraft && designDraft > 0 ? draft / designDraft : null;
  const threshold = ratio !== null ? 0.62 : Math.min(8.5, Number.isFinite(maxPortDraft) ? maxPortDraft * 0.62 : 8.5);
  const ballastReady = ratio !== null ? ratio < 0.62 : draft < threshold;

  return {
    state: ballastReady ? "Ballast" : "Laden",
    ballastReady,
    score: ballastReady ? 30 : 4,
    reason: ballastReady
      ? "Calado bajo: en lastre y candidato para cargar en POL"
      : "Calado alto: viene cargado y no sirve de inmediato para este POL",
  };
}

function windowScore(etaDate: Date, laycanStart: Date, laycanEnd: Date) {
  if (etaDate >= laycanStart && etaDate <= laycanEnd) {
    return { ok: true, score: 30, status: "inside" as const, reason: "ETA calculado dentro de la ventana de carga" };
  }
  if (etaDate < laycanStart) {
    const earlyDays = (laycanStart.getTime() - etaDate.getTime()) / 86_400_000;
    return { ok: earlyDays <= 3, score: earlyDays <= 3 ? 22 : 14, status: "early" as const, reason: `Llega ${earlyDays.toFixed(1)} días antes del laycan` };
  }
  const lateDays = (etaDate.getTime() - laycanEnd.getTime()) / 86_400_000;
  return { ok: false, score: Math.max(0, 12 - lateDays * 4), status: "late" as const, reason: `Llega ${lateDays.toFixed(1)} días después del cierre de laycan` };
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed", data: [] }, { status: 405, headers: jsonHeaders });
  }

  try {
    const body = pickObject(await req.json());
    const cargo = pickObject(body.cargo);
    const params = pickObject(body.params);
    const vesselClassContext = pickObject(body.vesselClassContext);
    const vesselClassProfile = pickObject(vesselClassContext.profile);
    const vesselClassValues = normalizeRequestedTaxonomies(
      Array.isArray(vesselClassContext.values)
        ? vesselClassContext.values
        : vesselClassContext.value,
    );
    const vessels = Array.isArray(body.radarSnapshot) ? body.radarSnapshot : [];
    const loadingPortLat = numberValue(cargo.loadingPortLat);
    const loadingPortLon = numberValue(cargo.loadingPortLon);
    const laycanStart = parseLaycanStart(cargo.laycanStart);
    const laycanEnd = parseLaycanEnd(cargo.laycanEnd);
    const quantity = numberValue(cargo.quantity);
    const stowageFactor = Math.max(0, numberValue(cargo.stowageFactor, cargo.stowage_factor));
    const requiredVolumeCbm = Math.max(0, numberValue(cargo.requiredVolumeCbm, cargo.required_volume_cbm) || (quantity * stowageFactor));
    const cargoDescription = textValue(
      cargo.cargoDescription,
      cargo.specification,
      cargo.cargoSpecification,
      cargo.cargoTypeLabel,
      cargo.tipoCarga,
      cargo.tipo_carga,
    );
    const cargoCode = textValue(cargo.cargoCode, cargo.cargoTypeId, cargo.typeId, body.cargoCode, body.cargoTypeId) || "100";
    const strictTechnicalFilter = body.strictTechnicalFilter === true || cargo.strictTechnicalFilter === true;
    const activeTaxonomyRequiresVerifiedData = vesselClassValues.length > 0
      || Boolean(cargoDescription)
      || cargoCode !== "100";
    const strictRequiredDwt = quantity > 0 ? quantity * 1.05 : 0;
    const strictPreferredMaximumDwt = quantity > 0 ? quantity * 1.15 : 0;
    const strictMaximumDwt = quantity > 0 ? quantity * 1.40 : 0;
    const methodsRequireShipGear = [cargo.loadMethod, cargo.dischargeMethod].some((value) => {
      const method = textValue(value).toLowerCase();
      return method === "cuchara_grab"
        || method.includes("grua_barco")
        || method.includes("ship_crane")
        || method.includes("onboard_crane");
    });
    const gearedRequired = cargo.gearedRequired === true || methodsRequireShipGear;
    const grabRequired = cargo.grabRequired === true
      || [cargo.loadMethod, cargo.dischargeMethod].some((value) => textValue(value) === "cuchara_grab");
    const requiredGrabCapacityCbm = numberValue(cargo.requiredGrabCapacityCbm, cargo.grabCapacityCbm);
    const requiredCraneSwlMt = numberValue(cargo.requiredCraneSwlMt, cargo.craneSwlMt);
    const maxDraft = numberValue(cargo.maxDraft) || Number.POSITIVE_INFINITY;
    const maxLoa = numberValue(cargo.maxLoa) || Number.POSITIVE_INFINITY;
    const freightRate = numberValue(cargo.freightRate);
    const bunkerMultiplier = numberValue(vesselClassProfile.bunkerMultiplier, 1) || 1;
    const riskCoefficient = numberValue(vesselClassProfile.riskCoefficient, 1) || 1;
    const fuelPrice = (numberValue(params.fuelPrice, 650) || 650) * bunkerMultiplier;
    const dailyOpex = numberValue(params.dailyOpex, 6500) || 6500;
    const portExpenses = (numberValue(params.portExpenses, 40000) || 40000) * riskCoefficient;
    const matchRadiusNm = numberValue(body.matchRadiusNm, cargo.matchRadiusNm, 2000) || 2000;

    if (!Number.isFinite(loadingPortLat) || !Number.isFinite(loadingPortLon)) {
      return Response.json({ success: false, error: "Invalid loading port coordinates", data: [] }, { status: 400, headers: jsonHeaders });
    }

    const verifiedSnapshot = await overrideVesselClassesFromMaster(vessels);
    if (verifiedSnapshot.degraded) {
      return Response.json({
        success: true,
        degraded: true,
        filterApplied: true,
        warning: "No se pudo verificar vessels_master; la flota compatible queda bloqueada por seguridad.",
        data: [],
        matches: [],
        nearbyVessels: [],
        discardedForMissingData: vessels.map((vessel, index) => ({
          vesselKey: textValue(pickObject(vessel).vesselKey, pickObject(vessel).vessel_key, `unverified-${index}`),
          reason: "MASTER_DATA_UNAVAILABLE",
        })),
        discardedForMissingDataCount: vessels.length,
        snapshot: { frozenAt: body.frozenAt || new Date().toISOString(), vesselCount: vessels.length },
      }, { status: 206, headers: jsonHeaders });
    }
    const verifiedSnapshotVessels = verifiedSnapshot.vessels;
    const vessels_buffer = verifiedSnapshotVessels
      .map(normalizeVessel)
      .filter((vessel): vessel is NonNullable<ReturnType<typeof normalizeVessel>> => Boolean(vessel))
      .filter((vessel) => vesselMatchesAnyTaxonomy(vessel, vesselClassValues)
        || (!activeTaxonomyRequiresVerifiedData && !strictTechnicalFilter && isUnknownTechnicalValue(vessel.shipType)));

    const evaluateVessels = (maxDwtToleranceMultiplier: number, isFallbackPass: boolean) => {
      return vessels_buffer
        .map((vessel) => {
          const cementSignal = classifyCementCarrierCandidate(vessel);
          const distance = vessel.hasValidPosition
            ? haversineNm(loadingPortLat, loadingPortLon, vessel.latitude as number, vessel.longitude as number)
            : null;
          const speedOverGround = Math.max(vessel.speed, 1);
          const hoursToLoadPort = distance === null ? null : distance / speedOverGround;
          const daysToLoadPort = hoursToLoadPort === null ? null : hoursToLoadPort / 24;
          const declaredEtaDate = parseDateValue(vessel.declaredEta);
          const etaDate = hoursToLoadPort !== null
            ? new Date(Date.now() + hoursToLoadPort * 60 * 60 * 1000)
            : (declaredEtaDate || new Date(laycanEnd.getTime() + 24 * 60 * 60 * 1000));
          const etaDriftHours = declaredEtaDate
            ? Math.round(Math.abs(declaredEtaDate.getTime() - etaDate.getTime()) / 36_000) / 100
            : null;
          const loadState = inferLoadState(vessel.draft, vessel.designDraft, maxDraft);
          const laycan = windowScore(etaDate, laycanStart, laycanEnd);
          const draftOk = vessel.draft <= 0 || vessel.draft <= maxDraft;
          const loaOk = vessel.loa <= 0 || vessel.loa <= maxLoa;
          const dateOk = laycan.ok;
          const technicalEligibility = evaluateCargoVesselEligibility({
            cargoTypeId: cargoCode,
            vessel: vessel.source,
            shipType: vessel.shipType,
            dwt: vessel.dwt,
            quantity,
            requiredVolumeCbm,
            gearedRequired,
            grabRequired,
            requiredGrabCapacityCbm,
            requiredCraneSwlMt,
            draftOk,
            loaOk,
            dateOk,
            maxDwtTolerance: maxDwtToleranceMultiplier,
          });
          const capacityOk = technicalEligibility.dwt.vessel !== null
            && technicalEligibility.dwt.vessel >= technicalEligibility.dwt.required
            && (technicalEligibility.dwt.maximumSuitable === null || technicalEligibility.dwt.vessel <= technicalEligibility.dwt.maximumSuitable);
          const etaConsistencyScore = etaDriftHours === null ? 8 : etaDriftHours <= 12 ? 10 : etaDriftHours <= 36 ? 6 : 2;
          const calculatedTechnical = (capacityOk ? 20 : 6) + (draftOk ? 10 : 0) + (loaOk ? 10 : 0) + loadState.score + laycan.score + etaConsistencyScore;
          const taxonomyScoring = calculateTaxonomyTechnicalScore(cargoDescription, vessel.source, calculatedTechnical);
          const taxonomyCompatibility = taxonomyScoring.compatibility;
          const cargoIntelligence = calculateCargoIntelligenceBoost(cargoCode, vessel.source);
          const technical = taxonomyScoring.technicalScore;
          const boostedTechnicalBeforeEligibility = taxonomyCompatibility.compatible
            ? Math.min(100, technical + cargoIntelligence.boost)
            : technical;
          const boostedTechnical = technicalEligibility.eligible
            ? boostedTechnicalBeforeEligibility
            : Math.min(20, boostedTechnicalBeforeEligibility);
          const dwtRatio = quantity > 0 && vessel.dwt !== null ? vessel.dwt / quantity : null;
          const isOversizedUnderStandard = dwtRatio !== null && dwtRatio > 1.15 && dwtRatio <= 1.40;
          const oversizePenalty = isOversizedUnderStandard
            ? Math.max(4, Math.round(((dwtRatio - 1.15) / 0.25) * 12))
            : 0;
          const economic = distance === null ? 0 : Math.max(0, 100 - distance / 35);
          const risk = daysToLoadPort === null ? 0 : Math.max(0, 100 - Math.max(0, daysToLoadPort - 7) * 8 * riskCoefficient);
          const baseOverall = Math.round(Math.min(100, boostedTechnical * 0.55 + economic * 0.30 + risk * 0.15));
          const overall = Math.max(0, baseOverall - oversizePenalty);
          const ballastFuelCost = distance === null ? 0 : distance * (fuelPrice / 100);
          const suggestedFreightRate = freightRate > 0 ? freightRate : Math.max(0, (ballastFuelCost + portExpenses + dailyOpex) / Math.max(quantity, 1));
          
          const isOversizedFallback = false;
          const activeDwtStatus = vessel.dwtStatus;
          const hasVerifiedDwt = vessel.dwt !== null && vessel.dwt > 0;
          const hasVerifiedVesselType = !isUnknownTechnicalValue(vessel.shipType);
          const isLiveRadarTelemetry = vessel.isLiveRadarSource
            || vessel.sourceOrigins.some((origin) => /AIS_LIVE|DATALASTIC|NEON_(?:ACTIVE_SCAN|SCAN_RESULTS)/i.test(origin))
            || /AIS_LIVE|DATALASTIC|NEON_(?:ACTIVE_SCAN|SCAN_RESULTS)/i.test(vessel.sourceOrigin);
          const telemetryVisibleWithoutDwt = isLiveRadarTelemetry && !hasVerifiedDwt;
          const missingCriticalData = activeTaxonomyRequiresVerifiedData
            && (!hasVerifiedVesselType || (!hasVerifiedDwt && !telemetryVisibleWithoutDwt));
          const missingCriticalReasons = [
            ...(!hasVerifiedDwt ? ["DWT_MISSING"] : []),
            ...(!hasVerifiedVesselType ? ["VESSEL_TYPE_MISSING"] : []),
          ];
          const dwtAssessment = !hasVerifiedDwt
            ? telemetryVisibleWithoutDwt
              ? { status: "PENDING_AUDIT", label: "DWT pendiente de auditar" }
              : { status: "BLOCKED_MISSING", label: "DWT obligatorio no verificado" }
            : strictRequiredDwt > 0 && vessel.dwt < strictRequiredDwt
              ? { status: "INSUFFICIENT", label: "DWT Insuficiente (margen operativo 5%)" }
              : strictMaximumDwt > 0 && vessel.dwt > strictMaximumDwt
                ? { status: "OVERSIZED", label: "DWT Sobredimensionado (máximo comercial +40%)" }
                : strictPreferredMaximumDwt > 0 && vessel.dwt > strictPreferredMaximumDwt
                  ? { status: "OVERSIZED_VIABLE", label: "Viable (Sobredimensionado) · penalización comercial" }
                  : { status: "SUFFICIENT", label: "DWT Validado" };
          const hasTechnicalWarning = !technicalEligibility.eligible
            || technicalEligibility.criticalReasons.length > 0
            || isOversizedUnderStandard
            || activeDwtStatus === null
            || !hasVerifiedDwt
            || !hasVerifiedVesselType;

          const warningReason = hasTechnicalWarning
            ? [
                ...(!hasVerifiedDwt ? ["DWT obligatorio no verificado"] : []),
                ...(!hasVerifiedVesselType ? ["Tipo de buque obligatorio no verificado"] : []),
                ...(isOversizedUnderStandard ? ["Viable sobredimensionado: DWT entre +15% y +40%; ranking penalizado"] : []),
                ...technicalEligibility.criticalReasons,
                ...(taxonomyCompatibility.compatible ? [] : [taxonomyCompatibility.reason]),
              ].filter(Boolean).join("; ") || "Advertencia técnica: Datos AIS incompletos"
            : null;

          const passesStrictDwtCapacity = telemetryVisibleWithoutDwt
            || !strictTechnicalFilter
            || (strictRequiredDwt > 0
              && strictMaximumDwt > 0
              && Number(vessel.dwt) >= strictRequiredDwt
              && Number(vessel.dwt) <= strictMaximumDwt);
          const operationallyEligible = taxonomyCompatibility.compatible !== false
            && !missingCriticalData
            && passesStrictDwtCapacity
            && (!strictTechnicalFilter || technicalEligibility.eligible || telemetryVisibleWithoutDwt);
          const idealVessel = operationallyEligible && !hasTechnicalWarning && loadState.ballastReady;
          const commercialRank = buildCommercialVesselRank({
            vesselDwt: vessel.dwt,
            targetCargoDwt: strictRequiredDwt,
            estimatedBallastStatus: vessel.estimatedBallastStatus,
            laycanCompliant: dateOk,
            transitHours: hoursToLoadPort,
            distanceNm: distance,
          });

          return {
            vessel_key: vessel.vesselKey,
            vesselKey: vessel.vesselKey,
            source_origins: vessel.sourceOrigins,
            sourceOrigins: vessel.sourceOrigins,
            source_origin: vessel.sourceOrigin,
            sourceOrigin: vessel.sourceOrigin,
            data_source: vessel.sourceOrigin,
            hasTechnicalWarning,
            hasWarning: hasTechnicalWarning,
            warning: warningReason,
            warningReason,
            dwtStatus: activeDwtStatus,
            dwtAssessment,
            isCommerciallyOversized: isOversizedUnderStandard,
            oversizePenalty,
            commercialRank,
            dwtDifferenceMt: commercialRank.dwtDifferenceMt,
            dwtDifference: commercialRank.dwtDifferenceMt,
            dwtFitPercent: commercialRank.dwtFitPercent,
            matchReason: vessel.matchReason,
            inboundToPol: vessel.matchReason === "INBOUND_TO_POL",
            operationalLabel: vessel.matchReason === "INBOUND_TO_POL" ? "Inbound to POL" : null,
            speedInferenceSource: vessel.speedInferenceSource,
            speedTelemetryAvailable: vessel.speedTelemetryAvailable,
            marketAverageSpeedKnots: vessel.marketAverageSpeedKnots,
            verifiedDwt: vessel.verifiedDwt,
            estimatedBallastStatus: vessel.estimatedBallastStatus,
            isOversizedFallback,
            vessel: {
              vesselName: vessel.vesselName,
              vessel_name: vessel.vesselName,
              imo: vessel.imo,
              mmsi: vessel.mmsi,
              dwt: vessel.dwt,
              matchReason: vessel.matchReason,
              inboundToPol: vessel.matchReason === "INBOUND_TO_POL",
              operationalLabel: vessel.matchReason === "INBOUND_TO_POL" ? "Inbound to POL" : null,
              verifiedDwt: vessel.verifiedDwt,
              dwtDifference: commercialRank.dwtDifferenceMt,
              estimatedBallastStatus: vessel.estimatedBallastStatus,
              dwtStatus: activeDwtStatus,
              dwtAssessment,
              vesselType: vessel.shipType,
              vessel_type: vessel.shipType,
              isOversizedFallback,
              hasTechnicalWarning,
              hasWarning: hasTechnicalWarning,
              warning: warningReason,
              draft: vessel.draft,
              designDraft: vessel.designDraft,
              loadState: loadState.state,
              estado_carga: loadState.state,
              loa: vessel.loa,
              hasCranes: technicalEligibility.equipment.hasGears === true,
              gruas_geared: technicalEligibility.equipment.hasGears === true,
              vesselClass: vessel.shipType,
              specialtyType: cementSignal.level === "confirmed" ? "Cement Carrier" : cementSignal.level === "possible" ? "Possible Cement Carrier" : vessel.shipType,
              cargoClass: cementSignal.level === "confirmed" ? "Cement Carrier" : cementSignal.level === "possible" ? "Possible Cement Carrier" : vessel.shipType,
              cementCarrierClassification: cementSignal,
              destination: vessel.destination,
              Destination: vessel.destination,
              eta: vessel.declaredEta || null,
              lastPortOfCall: vessel.lastPortOfCall,
              last_port_of_call: vessel.lastPortOfCall,
              ultimo_puerto: vessel.lastPortOfCall,
              vessel_key: vessel.vesselKey,
              vesselKey: vessel.vesselKey,
              source_origins: vessel.sourceOrigins,
              sourceOrigins: vessel.sourceOrigins,
              source_origin: vessel.sourceOrigin,
              sourceOrigin: vessel.sourceOrigin,
              data_source: vessel.sourceOrigin,
              speedInferenceSource: vessel.speedInferenceSource,
              speedTelemetryAvailable: vessel.speedTelemetryAvailable,
              marketAverageSpeedKnots: vessel.marketAverageSpeedKnots,
            },
            ais: {
              mmsi: vessel.mmsi,
              imo: vessel.imo,
              latitude: vessel.latitude,
              longitude: vessel.longitude,
              currentDistanceToLoadPort: distance === null ? null : Math.round(distance),
              hasValidPosition: vessel.hasValidPosition,
              longDistanceTransitToPol: vessel.longDistanceTransitToPol,
              commercialTransitCandidate: vessel.commercialTransitCandidate,
              daysToLoadPort: daysToLoadPort === null ? null : Math.round(daysToLoadPort * 10) / 10,
              speed_over_ground: speedOverGround,
              speedInferenceSource: vessel.speedInferenceSource,
              speedTelemetryAvailable: vessel.speedTelemetryAvailable,
              marketAverageSpeedKnots: vessel.marketAverageSpeedKnots,
              plannedDestination: vessel.destination,
              destination: vessel.destination,
              Destination: vessel.destination,
              lastPortOfCall: vessel.lastPortOfCall,
              last_port_of_call: vessel.lastPortOfCall,
              ultimo_puerto: vessel.lastPortOfCall,
              eta_puerto_carga: etaDate.toISOString(),
              declaredEta: vessel.declaredEta || null,
              etaDriftHours,
              dwt: vessel.dwt,
              matchReason: vessel.matchReason,
              inboundToPol: vessel.matchReason === "INBOUND_TO_POL",
              operationalLabel: vessel.matchReason === "INBOUND_TO_POL" ? "Inbound to POL" : null,
              verifiedDwt: vessel.verifiedDwt,
              dwtDifference: commercialRank.dwtDifferenceMt,
              estimatedBallastStatus: vessel.estimatedBallastStatus,
              dwtStatus: activeDwtStatus,
              isOversizedFallback,
              hasTechnicalWarning,
              hasWarning: hasTechnicalWarning,
              warning: warningReason,
              draft: vessel.draft,
              designDraft: vessel.designDraft,
              loadState: loadState.state,
              estado_carga: loadState.state,
              loa: vessel.loa,
              cementCarrierClassification: cementSignal,
              vessel_key: vessel.vesselKey,
              vesselKey: vessel.vesselKey,
              source_origins: vessel.sourceOrigins,
              sourceOrigins: vessel.sourceOrigins,
              source_origin: vessel.sourceOrigin,
              sourceOrigin: vessel.sourceOrigin,
              data_source: vessel.sourceOrigin,
            },
            routing: {
              eta: etaDate.toISOString(),
              ballastDistanceNM: distance === null ? null : Math.round(distance),
              daysToLoadPort: daysToLoadPort === null ? null : Math.round(daysToLoadPort * 10) / 10,
              speedOverGround: speedOverGround,
            },
            financials: {
              netProfit: 0,
              tce: 0,
              ballastFuelCost: Math.round(ballastFuelCost),
              suggestedFreightRate,
            },
            compatibility: {
              capacityOk,
              dwtAssessment,
              isOversizedFallback,
              volumeOk: technicalEligibility.volume.compatible,
              draftOk,
              loaOk,
              cranesOk: true,
              gearOk: !gearedRequired || technicalEligibility.equipment.hasGears === true,
              grabOk: !grabRequired || technicalEligibility.equipment.hasGrab === true,
              holdOk: true,
              dateOk,
              hasTechnicalWarning,
              hasWarning: hasTechnicalWarning,
              warning: warningReason,
              taxonomyCompatible: taxonomyCompatibility.compatible,
              taxonomyGoverned: taxonomyCompatibility.governed,
              cargoTaxonomy: taxonomyCompatibility.cargoTaxonomy,
              declaredVesselType: taxonomyCompatibility.declaredVesselType,
              vesselTaxonomies: taxonomyCompatibility.vesselTaxonomies,
              allowedVesselTaxonomies: taxonomyCompatibility.allowedVesselTaxonomies,
              ballastReady: loadState.ballastReady,
              idealVessel,
              laycanStatus: laycan.status,
              laycanStart: laycanStart.toISOString(),
              laycanEnd: laycanEnd.toISOString(),
              etaDriftHours,
              reasons: {
                loadState: loadState.reason,
                laycan: laycan.reason,
                etaConsistency: etaDriftHours === null
                  ? "Sin ETA AIS declarado para comparar"
                  : etaDriftHours <= 12
                    ? "ETA AIS declarado consistente con distancia y velocidad"
                    : `ETA AIS declarado difiere ${etaDriftHours.toFixed(1)} horas del cálculo a POL`,
                taxonomy: taxonomyCompatibility.reason,
                technicalEligibility: technicalEligibility.eligible
                  ? "Elegibilidad técnica estricta superada"
                  : technicalEligibility.criticalReasons.join("; "),
              },
            },
            scores: { technical: boostedTechnical, economic, risk, overall, cargoBoost: cargoIntelligence.boost },
            cargoIntelligence,
            technicalEligibility,
            aiStatus: !operationallyEligible ? "INCOMPATIBLE" : hasTechnicalWarning ? "REVIEW" : idealVessel && overall > 55 && cementSignal.level !== "possible" ? "IDEAL" : overall > 50 ? "MATCH" : "REVIEW",
            audit: {
              cargoCode,
              cargoDescription,
              selectedVesselTaxonomies: vesselClassValues,
              operationallyEligible,
              telemetryVisible: telemetryVisibleWithoutDwt,
              dwtPendingAudit: telemetryVisibleWithoutDwt,
              blockedForMissingCriticalData: missingCriticalData,
              missingCriticalData: missingCriticalReasons,
              strictTechnicalFilter,
              hasTechnicalWarning,
              hasWarning: hasTechnicalWarning,
              warning: warningReason,
              reasons: [
                ...technicalEligibility.criticalReasons,
                ...(taxonomyCompatibility.compatible ? [] : [taxonomyCompatibility.reason]),
              ],
            },
            idealVessel,
            cementCarrierClassification: cementSignal,
            eta_puerto_carga: etaDate.toISOString(),
            destino_actual: vessel.destination,
            ultimo_puerto: vessel.lastPortOfCall,
            timestamp: Date.now(),
          };
        })
        .filter((match) => match.ais.hasValidPosition !== true
          || (match.ais.currentDistanceToLoadPort !== null && match.ais.currentDistanceToLoadPort <= matchRadiusNm)
          || match.ais.longDistanceTransitToPol === true
          || match.ais.commercialTransitCandidate === true)
        .sort((a, b) => compareCommercialVesselRanks(a.commercialRank, b.commercialRank)
          || b.scores.overall - a.scores.overall);
    };

    const evaluatedMatches = evaluateVessels(1.40, false);
    const discardedForMissingData = evaluatedMatches
      .filter((match) => match.audit?.blockedForMissingCriticalData === true)
      .map((match) => ({
        vesselKey: match.vesselKey,
        vesselName: match.vessel?.vesselName || null,
        imo: match.vessel?.imo || null,
        reasons: match.audit?.missingCriticalData || [],
      }));
    const frontendEvaluatedMatches = evaluatedMatches
      .filter((match) => match.audit?.blockedForMissingCriticalData !== true);
    const matches = frontendEvaluatedMatches
      .filter((match) => strictTechnicalFilter
        ? (match.audit?.operationallyEligible === true
          && ["SUFFICIENT", "OVERSIZED_VIABLE"].includes(String(match.dwtAssessment?.status || "")))
          || match.audit?.telemetryVisible === true
        : match.audit?.operationallyEligible === true || match.audit?.telemetryVisible === true);
    const technicalWarnings = frontendEvaluatedMatches.filter((match) => match.hasTechnicalWarning || !match.audit.operationallyEligible);

    return Response.json({
      success: true,
      data: frontendEvaluatedMatches,
      dataIncludesWarnings: true,
      matches,
      technicalWarnings,
      discardedForMissingData,
      discardedForMissingDataCount: discardedForMissingData.length,
      eligibleCount: matches.length,
      compatibleCount: matches.length,
      operationalFilters: {
        gearedRequired,
        strictTechnicalFilter,
        strictRequiredDwt,
        strictPreferredMaximumDwt,
        strictMaximumDwt,
        stowageFactor,
        requiredVolumeCbm,
      },
      technicalWarningCount: technicalWarnings.length,
      evaluatedCount: frontendEvaluatedMatches.length,
      totalEvaluatedCount: evaluatedMatches.length,
      snapshot: { frozenAt: body.frozenAt || new Date().toISOString(), vesselCount: vessels_buffer.length },
      memory: { knownVesselsSaved: frontendEvaluatedMatches.length },
    }, { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Matching engine failed";
    return Response.json({ success: false, error: message, data: [] }, { status: 400, headers: jsonHeaders });
  }
};

export const config: Config = {
  path: ["/api/ai-ais-filter", "/.netlify/functions/ai-ais-filter"],
};
