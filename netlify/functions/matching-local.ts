import type { Config } from "@netlify/functions";
import { getPool } from "../../db/index.js";
import {
  findExactVesselsMasterRows,
  listVesselsMasterPendingAudit,
  type VesselMasterRow,
} from "../../db/vessels-master.js";
import {
  findMatchingVessels,
  normalizeAllowedMatchingSources,
  type AisMatchingRow,
} from "../../db/matching-sources.js";
import runAiAisFilter from "./ai-ais-filter.js";
import { mergeTripleVesselSources } from "./_shared/vessel-source-merge.js";
import { classifyCandidateMatch } from "./_shared/commercial-vessel-search.mjs";
import { fetchOpenShipsLive } from "./_shared/openships-rest.mjs";
import { fetchAisStreamBoundingBox } from "./_shared/live-ais-provider.mjs";
import { filterStrictDryCargoVessels } from "./_shared/strict-dry-cargo.js";
import { enrichVesselsWithMarketSpeedDefaults } from "./lib/market-speed.mjs";

type AnyRecord = Record<string, unknown>;

const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function parseRecord(value: unknown): AnyRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRecord;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function finiteNumberValue(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function textValue(...values: unknown[]) {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== "");
  return value === undefined || value === null ? "" : String(value).trim();
}

function numericValue(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusNm = 3440.065;
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return radiusNm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function buildLiveBoundingBox(latitude: number, longitude: number, radiusNm: number) {
  const latitudeDelta = Math.min(90, radiusNm / 60);
  const longitudeDelta = Math.min(180, radiusNm / (60 * Math.max(0.1, Math.cos(latitude * Math.PI / 180))));
  return {
    minLat: Math.max(-90, latitude - latitudeDelta),
    maxLat: Math.min(90, latitude + latitudeDelta),
    minLon: Math.max(-180, longitude - longitudeDelta),
    maxLon: Math.min(180, longitude + longitudeDelta),
  };
}

function readVesselValue(vessel: AnyRecord, keys: string[]) {
  const metadata = asRecord(vessel.MetaData || vessel.metadata);
  for (const key of keys) {
    const value = vessel[key] ?? metadata[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function prepareOpenShipsCommercialCandidates(
  vessels: AnyRecord[],
  options: {
    latitude: number;
    longitude: number;
    radiusNm: number;
    laycanEnd: string | null;
    polData: AnyRecord;
  },
) {
  return vessels.flatMap((vessel) => {
    const latitude = finiteNumberValue(vessel.latitude, vessel.lat);
    const longitude = finiteNumberValue(vessel.longitude, vessel.lon, vessel.lng);
    const distanceNm = latitude !== null && longitude !== null
      ? haversineNm(options.latitude, options.longitude, latitude, longitude)
      : null;
    const matchReason = classifyCandidateMatch({
      distanceNm,
      radiusNm: options.radiusNm,
      destination: readVesselValue(vessel, ["destination", "Destination", "current_destination", "currentDestination"]),
      polData: options.polData,
      eta: readVesselValue(vessel, ["eta", "ETA", "declaredEta", "estimatedEta"]),
      speedKnots: finiteNumberValue(vessel.speed_over_ground, vessel.speed, vessel.sog, vessel.SOG),
      laycanEnd: options.laycanEnd,
    });
    if (!matchReason) return [];
    return [{
      ...vessel,
      distance_nm: distanceNm,
      distanceToPolNm: distanceNm,
      matchReason,
      inboundToPol: matchReason === "INBOUND_TO_POL",
      longDistanceTransitToPol: matchReason === "INBOUND_TO_POL",
      commercialTransitCandidate: matchReason === "INBOUND_TO_POL",
      searchVector: matchReason === "INBOUND_TO_POL" ? "DESTINATION_GLOBAL" : "RADIAL",
    }];
  });
}

const UNKNOWN_TECHNICAL_VALUES = new Set(["", "n/a", "na", "n/d", "n d", "nd", "unknown", "desconocido", "null", "undefined"]);

function isUnknownTechnicalValue(value: unknown) {
  return UNKNOWN_TECHNICAL_VALUES.has(normalizeText(value));
}

function validImo(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{7}$/.test(digits) ? digits : "";
}

function normalizeText(value: unknown) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCandidate(value: unknown, index: number) {
  const candidate = asRecord(value);
  const metadata = asRecord(candidate.MetaData);
  return {
    candidateId: textValue(candidate.candidateId, candidate.id, candidate.storageKey) || `candidate-${index + 1}`,
    imo: textValue(candidate.imo, candidate.IMO, candidate.imoNumber, candidate.imo_number, metadata.IMO),
    mmsi: textValue(candidate.mmsi, candidate.MMSI, metadata.MMSI),
    vesselName: textValue(candidate.vesselName, candidate.vessel_name, candidate.name, candidate.ShipName, metadata.ShipName) || `Buque ${index + 1}`,
    vesselType: textValue(candidate.vesselType, candidate.vessel_type, candidate.shipType, candidate.ShipType, candidate.tipo_buque, candidate.tipo, metadata.ShipType),
    dwt: numericValue(candidate.dwt, candidate.DWT, metadata.dwt, metadata.DWT),
    source: candidate,
  };
}

function serializeMasterVessel(row: VesselMasterRow) {
  const matchingRow = asRecord(row);
  const sourcePayload = parseRecord(row.source_payload);
  const message = parseRecord(sourcePayload.Message);
  const metadata = parseRecord(sourcePayload.MetaData || sourcePayload.metadata || message.MetaData);
  const positionReport = parseRecord(
    sourcePayload.PositionReport
      || message.PositionReport
      || sourcePayload.StandardClassBPositionReport
      || message.StandardClassBPositionReport
      || sourcePayload.ExtendedClassBPositionReport
      || message.ExtendedClassBPositionReport,
  );
  const staticData = parseRecord(sourcePayload.ShipStaticData || message.ShipStaticData);
  const latitude = finiteNumberValue(
    row.latitude,
    sourcePayload.latitude,
    sourcePayload.lat,
    metadata.latitude,
    metadata.Latitude,
    positionReport.Latitude,
    positionReport.latitude,
  );
  const longitude = finiteNumberValue(
    row.longitude,
    sourcePayload.longitude,
    sourcePayload.lon,
    sourcePayload.lng,
    metadata.longitude,
    metadata.Longitude,
    positionReport.Longitude,
    positionReport.longitude,
  );
  const vesselName = textValue(row.vessel_name, sourcePayload.vesselName, sourcePayload.vessel_name, sourcePayload.ShipName, metadata.ShipName, staticData.Name) || "Unknown vessel";
  const imo = textValue(row.imo_number, sourcePayload.imo, sourcePayload.IMO, sourcePayload.imo_number, metadata.IMO, staticData.ImoNumber) || "N/A";
  const mmsi = textValue(row.mmsi, sourcePayload.mmsi, sourcePayload.MMSI, metadata.MMSI, positionReport.UserID, staticData.UserID) || "N/A";
  const vesselType = textValue(row.vessel_type, sourcePayload.vesselType, sourcePayload.vessel_type, sourcePayload.shipType, sourcePayload.ShipType, metadata.ShipType, staticData.Type) || "Unknown";
  const cargoType = textValue(sourcePayload.cargoType, sourcePayload.tipo_carga, metadata.cargoType, metadata.tipo_carga, vesselType) || vesselType;
  const dwt = numericValue(row.dwt, sourcePayload.dwt, sourcePayload.DWT, metadata.dwt, metadata.DWT);
  const draft = finiteNumberValue(row.draft_meters, sourcePayload.draft, sourcePayload.Draft, metadata.draft, metadata.Draft, staticData.MaximumStaticDraught);
  const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
  return {
    ...sourcePayload,
    Message: message,
    MetaData: metadata,
    PositionReport: positionReport,
    ShipStaticData: staticData,
    imo,
    IMO: imo,
    imoNumber: imo,
    imo_number: imo,
    mmsi,
    MMSI: mmsi,
    vesselName,
    vessel_name: vesselName,
    ShipName: vesselName,
    vesselType,
    vessel_type: vesselType,
    shipType: vesselType,
    ShipType: vesselType,
    cargoType,
    tipo_carga: cargoType,
    dwt,
    DWT: dwt,
    latitude,
    lat: latitude,
    longitude,
    lon: longitude,
    lng: longitude,
    draft,
    Draft: draft,
    flag: row.flag,
    eta: row.eta,
    lastPortOfCall: row.last_port,
    currentDestination: row.current_destination,
    destination: row.current_destination,
    yearBuilt: row.year_built,
    grossTonnage: row.gross_tonnage,
    gross_tonnage: row.gross_tonnage,
    gt: row.gross_tonnage,
    loaMeters: row.loa_meters,
    loa_meters: row.loa_meters,
    loa: row.loa_meters,
    ownerManager: row.owner_manager,
    hasGears: row.has_gears,
    ballastSpeed: finiteNumberValue(sourcePayload.ballastSpeed, sourcePayload.spd_ballast, sourcePayload.speed_ballast),
    ladenSpeed: finiteNumberValue(sourcePayload.ladenSpeed, sourcePayload.spd_laden, sourcePayload.speed_laden),
    consumptionSea: finiteNumberValue(sourcePayload.consumptionSea, sourcePayload.cons_sea, sourcePayload.consumption_sea),
    consumptionPort: finiteNumberValue(sourcePayload.consumptionPort, sourcePayload.cons_port, sourcePayload.consumption_port),
    processStatus: row.process_status,
    status: row.status || null,
    validation_status: row.validation_status || null,
    origin: row.origen || null,
    cacheStatus: "Caché Validada",
    cacheValidated: true,
    masterUpdatedAt: updatedAt && Number.isFinite(updatedAt.getTime()) ? updatedAt.toISOString() : null,
    matchReason: textValue(matchingRow.matchReason) || null,
    verifiedDwt: matchingRow.verifiedDwt === true,
    dwtDifference: finiteNumberValue(matchingRow.dwtDifference, matchingRow.dwtDifferenceMt),
    estimatedBallastStatus: matchingRow.estimatedBallastStatus === true,
    laycanCompliant: matchingRow.laycanCompliant === true,
    longDistanceTransitToPol: matchingRow.longDistanceTransitToPol === true,
    commercialTransitCandidate: matchingRow.commercialTransitCandidate === true,
    distanceToPolNm: finiteNumberValue(matchingRow.distance_nm),
    verifiedDesignDraft: finiteNumberValue(matchingRow.verified_design_draft),
  };
}

function toIsoString(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function serializeAisVessel(row: AisMatchingRow) {
  const matchingRow = asRecord(row);
  const rawData = parseRecord(row.raw_data);
  return {
    ...rawData,
    storageKey: row.storage_key,
    imo: row.imo_number,
    IMO: row.imo_number,
    imoNumber: row.imo_number,
    imo_number: row.imo_number,
    mmsi: row.mmsi,
    MMSI: row.mmsi,
    vesselName: row.vessel_name,
    vessel_name: row.vessel_name,
    vesselType: row.vessel_type,
    vessel_type: row.vessel_type,
    latitude: row.latitude,
    lat: row.latitude,
    longitude: row.longitude,
    lon: row.longitude,
    lng: row.longitude,
    source: row.source,
    audit_status: row.audit_status,
    auditStatus: row.audit_status,
    firstSeenAt: toIsoString(row.first_seen_at),
    lastSeenAt: toIsoString(row.last_seen_at),
    distanceToPolNm: Number(row.distance_nm),
    dwt: finiteNumberValue(matchingRow.dwt, matchingRow.DWT),
    DWT: finiteNumberValue(matchingRow.dwt, matchingRow.DWT),
    dwtStatus: textValue(matchingRow.dwtStatus) || null,
    matchReason: textValue(matchingRow.matchReason) || null,
    verifiedDwt: matchingRow.verifiedDwt === true,
    dwtDifference: finiteNumberValue(matchingRow.dwtDifference, matchingRow.dwtDifferenceMt),
    estimatedBallastStatus: matchingRow.estimatedBallastStatus === true,
    laycanCompliant: matchingRow.laycanCompliant === true,
    longDistanceTransitToPol: matchingRow.longDistanceTransitToPol === true,
    commercialTransitCandidate: matchingRow.commercialTransitCandidate === true,
    verifiedDesignDraft: finiteNumberValue(matchingRow.verified_design_draft),
  };
}

function serializeOpenShipsVessel(value: unknown, source = "OPENSHIPS") {
  const row = asRecord(value);
  const rawData = parseRecord(row.raw_data);
  const metadata = asRecord(row.MetaData || row.metadata || rawData.MetaData || rawData.metadata);
  const vesselName = textValue(row.vessel_name, row.vesselName, row.ShipName, rawData.vessel_name, rawData.vesselName, metadata.ShipName) || "Unknown vessel";
  const rawVesselType = textValue(row.vessel_type, row.vesselType, rawData.vessel_type, rawData.vesselType, metadata.ShipType);
  const vesselType = isUnknownTechnicalValue(rawVesselType) ? "Unknown" : rawVesselType;
  const latitude = finiteNumberValue(row.latitude, row.lat, rawData.latitude, rawData.lat, metadata.Latitude);
  const longitude = finiteNumberValue(row.longitude, row.lon, row.lng, rawData.longitude, rawData.lon, rawData.lng, metadata.Longitude);
  const imo = textValue(row.imo_number, row.imo, row.IMO, rawData.imo_number, rawData.imo, rawData.IMO, metadata.IMO) || "N/A";
  const mmsi = textValue(row.mmsi, row.MMSI, rawData.mmsi, rawData.MMSI, metadata.MMSI) || "N/A";
  const dwt = numericValue(row.dwt, row.DWT, rawData.dwt, rawData.DWT, metadata.dwt, metadata.DWT);
  return {
    ...rawData,
    ...row,
    storageKey: textValue(row.storage_key, row.storageKey, row.vessel_key),
    imo,
    IMO: imo,
    imoNumber: imo,
    imo_number: imo,
    mmsi,
    MMSI: mmsi,
    vesselName,
    vessel_name: vesselName,
    ShipName: vesselName,
    vesselType,
    vessel_type: vesselType,
    shipType: vesselType,
    dwt,
    DWT: dwt,
    dwtStatus: textValue(row.dwtStatus, rawData.dwtStatus) || (dwt ? "OPENSHIPS_REPORTED" : null),
    vesselTypeStatus: vesselType !== "Unknown" ? "OPENSHIPS_REPORTED" : null,
    latitude,
    lat: latitude,
    longitude,
    lon: longitude,
    lng: longitude,
    source,
    audit_status: "OPENSHIPS_LIVE",
    auditStatus: "OPENSHIPS_LIVE",
    speed: finiteNumberValue(row.speed_over_ground, row.speed_sog, row.speed, row.sog, rawData.speed_over_ground, rawData.speed_sog, rawData.speed, rawData.sog),
    course: finiteNumberValue(row.course_over_ground, row.course, row.cog, rawData.course_over_ground, rawData.course, rawData.cog),
    heading: finiteNumberValue(row.heading, rawData.heading),
    lastSeenAt: textValue(row.observed_at, row.fetched_at, row.updated_at) || null,
    distanceToPolNm: finiteNumberValue(row.distance_nm),
    verifiedDesignDraft: finiteNumberValue(row.verified_design_draft, rawData.verified_design_draft),
  };
}

async function enrichOpenShipsTechnicalData(vessels: AnyRecord[]) {
  const vesselsRequiringEnrichment = vessels.filter((vessel) => validImo(vessel.imo || vessel.IMO || vessel.imo_number));
  const imoNumbers = [...new Set(vesselsRequiringEnrichment
    .map((vessel) => validImo(vessel.imo || vessel.IMO || vessel.imo_number))
    .filter(Boolean))];
  const diagnostics = {
    attempted: vesselsRequiringEnrichment.length,
    queriedImos: imoNumbers.length,
    matchedByImo: 0,
    dwtEnriched: 0,
    vesselTypeEnriched: 0,
    failed: false,
    errorCode: null as string | null,
  };
  if (imoNumbers.length === 0) return { vessels, diagnostics };

  let masterRows: VesselMasterRow[];
  try {
    masterRows = await findExactVesselsMasterRows(imoNumbers, [], []);
  } catch (error) {
    diagnostics.failed = true;
    diagnostics.errorCode = "VESSELS_MASTER_LOOKUP_FAILED";
    console.error(
      "[matching-local] OpenShips IMO enrichment failed.",
      error instanceof Error ? error.message : "Unknown database error",
    );
    return {
      vessels: vessels.map((vessel) => ({
        ...vessel,
        technicalDataEnrichment: {
          attempted: vesselsRequiringEnrichment.includes(vessel),
          matchedByImo: false,
          source: null,
          dwtEnriched: false,
          vesselTypeEnriched: false,
          errorCode: diagnostics.errorCode,
        },
      })),
      diagnostics,
    };
  }
  const masterByImo = new Map(masterRows
    .map((row) => [validImo(row.imo_number), row] as const)
    .filter(([imo]) => Boolean(imo)));

  const enrichedVessels = vessels.map((vessel) => {
    const imo = validImo(vessel.imo || vessel.IMO || vessel.imo_number);
    const master = imo ? masterByImo.get(imo) : null;
    const currentDwt = numericValue(vessel.dwt, vessel.DWT);
    const masterDwt = numericValue(master?.dwt);
    const currentType = textValue(vessel.vesselType, vessel.vessel_type, vessel.shipType);
    const masterType = textValue(master?.vessel_type);
    const needsDwt = !currentDwt || Boolean(masterDwt && currentDwt !== masterDwt);
    const needsVesselType = Boolean(masterType) && normalizeText(currentType) !== normalizeText(masterType);
    const enrichedDwt = masterDwt || currentDwt;
    const enrichedVesselType = !isUnknownTechnicalValue(masterType) ? masterType : currentType;
    if (master) diagnostics.matchedByImo += 1;
    if (needsDwt && masterDwt) diagnostics.dwtEnriched += 1;
    if (needsVesselType && !isUnknownTechnicalValue(masterType)) diagnostics.vesselTypeEnriched += 1;

    const authoritativeMaster = master ? serializeMasterVessel(master) : {};
    const liveLatitude = finiteNumberValue(vessel.latitude, vessel.lat);
    const liveLongitude = finiteNumberValue(vessel.longitude, vessel.lon, vessel.lng);
    const liveSpeed = finiteNumberValue(vessel.speed, vessel.speed_sog, vessel.sog, vessel.speed_over_ground);
    return {
      ...vessel,
      ...authoritativeMaster,
      dwt: enrichedDwt,
      DWT: enrichedDwt,
      dwtStatus: enrichedDwt
        ? needsDwt && masterDwt ? "VERIFIED_VESSELS_MASTER" : vessel.dwtStatus || "OPENSHIPS_REPORTED"
        : null,
      vesselType: isUnknownTechnicalValue(enrichedVesselType) ? "Unknown" : enrichedVesselType,
      vessel_type: isUnknownTechnicalValue(enrichedVesselType) ? "Unknown" : enrichedVesselType,
      shipType: isUnknownTechnicalValue(enrichedVesselType) ? "Unknown" : enrichedVesselType,
      vesselTypeStatus: !isUnknownTechnicalValue(enrichedVesselType)
        ? needsVesselType && !isUnknownTechnicalValue(masterType) ? "VERIFIED_VESSELS_MASTER" : vessel.vesselTypeStatus || "OPENSHIPS_REPORTED"
        : null,
      latitude: liveLatitude,
      lat: liveLatitude,
      longitude: liveLongitude,
      lon: liveLongitude,
      lng: liveLongitude,
      speed: liveSpeed,
      speed_over_ground: liveSpeed,
      source: textValue(vessel.source) || "AIS_LIVE",
      masterTruthApplied: Boolean(master),
      technicalDataEnrichment: {
        attempted: true,
        matchedByImo: Boolean(master),
        source: master ? "DATABRIDGE_VESSELS_MASTER" : null,
        dwtEnriched: Boolean(needsDwt && masterDwt),
        vesselTypeEnriched: Boolean(needsVesselType && !isUnknownTechnicalValue(masterType)),
      },
    };
  });
  return { vessels: enrichedVessels, diagnostics };
}

function findExactMasterRow(candidate: ReturnType<typeof normalizeCandidate>, rows: VesselMasterRow[]) {
  const candidateName = normalizeText(candidate.vesselName);
  return rows.find((row) => candidate.imo && row.imo_number === candidate.imo)
    || rows.find((row) => candidate.mmsi && row.mmsi === candidate.mmsi)
    || rows.find((row) => candidateName && normalizeText(row.vessel_name) === candidateName)
    || null;
}

async function loadExactCandidates(candidates: ReturnType<typeof normalizeCandidate>[]) {
  const imoNumbers = [...new Set(candidates.map((candidate) => candidate.imo).filter(Boolean))];
  const mmsiNumbers = [...new Set(candidates.map((candidate) => candidate.mmsi).filter(Boolean))];
  const vesselNames = [...new Set(candidates.map((candidate) => normalizeText(candidate.vesselName)).filter(Boolean))];
  if (imoNumbers.length === 0 && mmsiNumbers.length === 0 && vesselNames.length === 0) return [];

  return findExactVesselsMasterRows(imoNumbers, mmsiNumbers, vesselNames);
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 512 * 1024) {
    return Response.json({ success: false, error: "MATCHING_LOCAL_PAYLOAD_TOO_LARGE" }, { status: 413, headers });
  }

  try {
    const body = asRecord(await req.json());
    const operation = textValue(body.operation) || "match";
    const candidates = (Array.isArray(body.candidates) ? body.candidates : [])
      .slice(0, 1000)
      .map(normalizeCandidate);

    if (operation === "execute") {
      const matchingPayload = asRecord(body.matchingPayload);
      const cargo = asRecord(matchingPayload.cargo);
      const loadingPortLat = finiteNumberValue(cargo.loadingPortLat);
      const loadingPortLon = finiteNumberValue(cargo.loadingPortLon);
      const targetCargoDwtValue = finiteNumberValue(cargo.quantity);
      const targetCargoDwt = targetCargoDwtValue !== null && targetCargoDwtValue > 0 ? targetCargoDwtValue : null;
      const matchRadiusNm = Math.min(5000, Math.max(1, finiteNumberValue(matchingPayload.matchRadiusNm) || 2000));
      const allowedSources = normalizeAllowedMatchingSources(matchingPayload.allowedSources || body.allowedSources);
      const requestedLimit = finiteNumberValue(matchingPayload.limit, body.limit) || 50;
      const requestedOffset = finiteNumberValue(matchingPayload.offset, body.offset) || 0;
      const route = asRecord(matchingPayload.route);
      const suppliedPolData = asRecord(matchingPayload.polData || cargo.polData || route.polData);
      const suppliedAliases = [
        ...(Array.isArray(suppliedPolData.aliases) ? suppliedPolData.aliases : []),
        ...(Array.isArray(cargo.loadingPortAliases) ? cargo.loadingPortAliases : []),
        ...(Array.isArray(route.polAliases) ? route.polAliases : []),
      ];
      const polData = {
        unLocode: textValue(suppliedPolData.unLocode, suppliedPolData.unlocode, suppliedPolData.locode, cargo.loadingPortUnlocode, route.polUnlocode),
        officialName: textValue(suppliedPolData.officialName, cargo.loadingPortOfficialName, route.polOfficialName),
        name: textValue(suppliedPolData.name, cargo.loadingPortName, route.pol),
        aliases: suppliedAliases,
      };
      const databaseSources = allowedSources.filter((source) => source !== "OPENSHIPS");
      const emptySourcePage = { rows: [], totalCount: 0, limit: Math.min(100, Math.max(1, Math.trunc(requestedLimit))), offset: Math.max(0, Math.trunc(requestedOffset)) };
      const sourcePagePromise = databaseSources.length > 0
        ? findMatchingVessels({
          allowedSources: databaseSources,
          latitude: loadingPortLat,
          longitude: loadingPortLon,
          radiusNm: matchRadiusNm,
          cargoQuantity: targetCargoDwt || 0,
          targetDwt: finiteNumberValue(matchingPayload.targetDwt, cargo.targetDwt),
          laycanStart: textValue(cargo.laycanStart, matchingPayload.laycanStart) || null,
          laycanEnd: textValue(cargo.laycanEnd, matchingPayload.laycanEnd) || null,
          polData,
          limit: requestedLimit,
          offset: requestedOffset,
        })
        : Promise.resolve(emptySourcePage);
      const liveBounds = loadingPortLat !== null && loadingPortLon !== null
        ? buildLiveBoundingBox(loadingPortLat, loadingPortLon, matchRadiusNm)
        : null;
      const openShipsPromise = allowedSources.includes("OPENSHIPS") && loadingPortLat !== null && loadingPortLon !== null
        ? fetchOpenShipsLive({
          latitude: loadingPortLat,
          longitude: loadingPortLon,
          limit: 5000,
          aisTypes: [70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
        })
        : Promise.resolve(null);
      const aisStreamPromise = allowedSources.includes("AIS_LIVE") && liveBounds
        ? fetchAisStreamBoundingBox({
          bounds: liveBounds,
          limit: 2000,
          aisTypes: [70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
        })
        : Promise.resolve([]);
      const [sourcePageResult, openShipsResult, aisStreamResult] = await Promise.allSettled([
        sourcePagePromise,
        openShipsPromise,
        aisStreamPromise,
      ]);
      if (sourcePageResult.status === "rejected") throw sourcePageResult.reason;
      const sourcePage = sourcePageResult.value;
      const dataBridgeVessels = filterStrictDryCargoVessels(sourcePage.rows
        .filter((row) => row.source_system === "DATABRIDGE")
        .map((row) => serializeMasterVessel(row.payload as unknown as VesselMasterRow)));
      const persistedAisVessels = filterStrictDryCargoVessels(sourcePage.rows
        .filter((row) => row.source_system === "AIS_LIVE")
        .map((row) => serializeAisVessel(row.payload as unknown as AisMatchingRow)));
      let openShipsFetchDiagnostics: AnyRecord = { requested: false, success: false, count: 0 };
      let serializedOpenShipsVessels: AnyRecord[] = [];
      if (allowedSources.includes("OPENSHIPS") && loadingPortLat !== null && loadingPortLon !== null) {
        openShipsFetchDiagnostics = { requested: true, success: false, count: 0 };
        if (openShipsResult.status === "fulfilled" && openShipsResult.value) {
          const liveOpenShips = openShipsResult.value;
          serializedOpenShipsVessels = prepareOpenShipsCommercialCandidates(
            filterStrictDryCargoVessels(liveOpenShips.vessels).map((vessel) => serializeOpenShipsVessel(vessel, "OPENSHIPS")),
            {
              latitude: loadingPortLat,
              longitude: loadingPortLon,
              radiusNm: matchRadiusNm,
              laycanEnd: textValue(cargo.laycanEnd, matchingPayload.laycanEnd) || null,
              polData,
            },
          );
          openShipsFetchDiagnostics = {
            requested: true,
            success: true,
            count: serializedOpenShipsVessels.length,
            providerCount: liveOpenShips.count,
            fetchedAt: liveOpenShips.fetchedAt,
            cache: "disabled",
          };
        } else {
          const error = openShipsResult.status === "rejected" ? openShipsResult.reason : new Error("OpenShips returned no result");
          const code = error instanceof Error && "code" in error ? String(error.code) : "OPENSHIPS_UNAVAILABLE";
          const diagnostics = error && typeof error === "object" && "diagnostics" in error
            ? asRecord((error as { diagnostics?: unknown }).diagnostics)
            : {};
          const warning = {
            code,
            message: diagnostics.message ?? (error instanceof Error ? error.message : "OpenShips REST request failed"),
            httpStatus: diagnostics.httpStatus ?? null,
            statusText: diagnostics.statusText ?? null,
            requestUrl: diagnostics.requestUrl ?? null,
          };
          openShipsFetchDiagnostics = {
            requested: true,
            success: false,
            count: 0,
            error: code,
            upstream: warning,
            warnings: [warning],
            cache: "disabled",
          };
          console.warn("[matching-local] Live OpenShips REST source unavailable.", warning);
        }
      }
      const liveAisStreamVessels = aisStreamResult.status === "fulfilled"
        ? prepareOpenShipsCommercialCandidates(
          filterStrictDryCargoVessels(aisStreamResult.value).map((vessel) => serializeOpenShipsVessel(vessel, "AISSTREAM_LIVE")),
          {
            latitude: loadingPortLat as number,
            longitude: loadingPortLon as number,
            radiusNm: matchRadiusNm,
            laycanEnd: textValue(cargo.laycanEnd, matchingPayload.laycanEnd) || null,
            polData,
          },
        )
        : [];
      const aisStreamFetchDiagnostics: AnyRecord = aisStreamResult.status === "fulfilled"
        ? { requested: allowedSources.includes("AIS_LIVE"), success: true, count: liveAisStreamVessels.length }
        : {
          requested: allowedSources.includes("AIS_LIVE"),
          success: false,
          count: 0,
          error: textValue(asRecord(aisStreamResult.reason).code) || "AISSTREAM_UNAVAILABLE",
          warning: aisStreamResult.reason instanceof Error ? aisStreamResult.reason.message : "AISstream WebSocket unavailable",
        };
      const liveEnrichment = await enrichOpenShipsTechnicalData([...liveAisStreamVessels, ...serializedOpenShipsVessels]);
      const enrichedAisStreamVessels = liveEnrichment.vessels.filter((vessel) => vessel.source === "AISSTREAM_LIVE");
      const openShipsVessels = liveEnrichment.vessels.filter((vessel) => vessel.source !== "AISSTREAM_LIVE");
      const aisVessels = [...persistedAisVessels, ...enrichedAisStreamVessels];
      const unifiedVessels = filterStrictDryCargoVessels(mergeTripleVesselSources([], dataBridgeVessels, aisVessels, openShipsVessels));
      let scoringVessels = unifiedVessels;
      let marketSpeedEnrichment: AnyRecord = {
        requestedClasses: [],
        resolvedClasses: [],
        defaultedCount: 0,
        source: "market_average_speeds",
      };
      try {
        const enriched = await enrichVesselsWithMarketSpeedDefaults(getPool(), unifiedVessels);
        scoringVessels = enriched.vessels;
        marketSpeedEnrichment = enriched.diagnostics;
      } catch (error) {
        console.error("[matching-local] Market speed defaults unavailable.", {
          code: asRecord(error).code,
        });
        marketSpeedEnrichment = {
          ...marketSpeedEnrichment,
          failed: true,
        };
      }
      const sourceCounts = {
        master: 0,
        dataBridge: dataBridgeVessels.length,
        aisLive: aisVessels.length,
        aisStream: enrichedAisStreamVessels.length,
        openShips: openShipsVessels.length,
        unified: unifiedVessels.length,
      };
      const pagination = {
        limit: sourcePage.limit,
        offset: sourcePage.offset,
        nextOffset: sourcePage.offset + sourcePage.rows.length,
        returned: sourcePage.rows.length,
        total: sourcePage.totalCount,
        hasMore: sourcePage.offset + sourcePage.rows.length < sourcePage.totalCount,
      };
      if (unifiedVessels.length === 0) {
        return Response.json({
          success: true,
          operation: "execute",
          source: "filtered_sources",
          sourceCounts,
          openShipsEnrichment: liveEnrichment.diagnostics,
          marketSpeedEnrichment,
          openShipsFetch: openShipsFetchDiagnostics,
          aisStreamFetch: aisStreamFetchDiagnostics,
          warnings: [
            ...(Array.isArray(openShipsFetchDiagnostics.warnings) ? openShipsFetchDiagnostics.warnings : []),
            ...(aisStreamFetchDiagnostics.warning ? [{ code: aisStreamFetchDiagnostics.error, message: aisStreamFetchDiagnostics.warning }] : []),
          ],
          allowedSources,
          pagination,
          readOnly: true,
          data: [],
          matches: [],
          count: 0,
          localVesselCount: 0,
          dataBridgeVesselCount: dataBridgeVessels.length,
          aisVesselCount: aisVessels.length,
          openShipsVesselCount: openShipsVessels.length,
          unifiedVesselCount: 0,
          message: "No se encontraron coincidencias locales",
        }, { headers });
      }

      const scoringRequest = new Request(new URL("/api/ai-ais-filter", req.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...matchingPayload,
          radarSnapshot: scoringVessels,
          searchMode: "filtered_source_database",
          frozenAt: new Date().toISOString(),
        }),
      });
      const scoringResponse = await runAiAisFilter(scoringRequest);
      const scoringResult = asRecord(await scoringResponse.json());
      const evaluatedMatches = Array.isArray(scoringResult.data) ? scoringResult.data : [];
      const eligibleMatches = Array.isArray(scoringResult.matches) ? scoringResult.matches : [];
      return Response.json({
        ...scoringResult,
        success: scoringResponse.ok && scoringResult.success !== false,
        operation: "execute",
        source: "filtered_sources",
        sourceCounts,
        openShipsEnrichment: liveEnrichment.diagnostics,
        marketSpeedEnrichment,
        openShipsFetch: openShipsFetchDiagnostics,
        aisStreamFetch: aisStreamFetchDiagnostics,
        warnings: [
          ...(Array.isArray(openShipsFetchDiagnostics.warnings) ? openShipsFetchDiagnostics.warnings : []),
          ...(aisStreamFetchDiagnostics.warning ? [{ code: aisStreamFetchDiagnostics.error, message: aisStreamFetchDiagnostics.warning }] : []),
        ],
        allowedSources,
        pagination,
        readOnly: true,
        data: evaluatedMatches,
        matches: eligibleMatches,
        count: evaluatedMatches.length,
        localVesselCount: 0,
        dataBridgeVesselCount: dataBridgeVessels.length,
        aisVesselCount: aisVessels.length,
        openShipsVesselCount: openShipsVessels.length,
        unifiedVesselCount: unifiedVessels.length,
        message: evaluatedMatches.length > 0 ? "Coincidencias de fuentes filtradas calculadas" : "No se encontraron coincidencias locales",
      }, { status: scoringResponse.status, headers });
    }

    if (operation === "audit") {
      const auditRows = await listVesselsMasterPendingAudit();
      return Response.json({
        success: true,
        operation: "audit",
        readOnly: true,
        count: auditRows.length,
        vessels: auditRows,
      }, { headers });
    }

    const rows = await loadExactCandidates(candidates);
    const validated: AnyRecord[] = [];
    const unknown: AnyRecord[] = [];
    for (const candidate of candidates) {
      const matchedRow = findExactMasterRow(candidate, rows);
      if (matchedRow) {
        validated.push({
          candidateId: candidate.candidateId,
          status: "Caché Validada",
          vessel: serializeMasterVessel(matchedRow),
        });
      } else {
        unknown.push({
          ...candidate,
          status: "Desconocido",
          source: undefined,
        });
      }
    }

    return Response.json({
      success: true,
      operation: "match",
      source: "vessels_master",
      readOnly: true,
      stopped: unknown.length > 0,
      status: unknown.length > 0 ? "Desconocido" : "Caché Validada",
      validated,
      unknown,
    }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar vessels_master.";
    console.error("[matching-local] Read-only query failed.", message);
    return Response.json({ success: false, error: message }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/matching-local",
  method: "POST",
};
