import type { Config } from "@netlify/functions";
import { calculateCargoIntelligenceBoost, evaluateCargoVesselEligibility } from "../../cargo-taxonomy.mjs";
import { calculateTaxonomyTechnicalScore } from "./_shared/taxonomy-compatibility.mjs";

type AnyRecord = Record<string, unknown>;

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function pickObject(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function textValue(...values: unknown[]) {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== "");
  return value === undefined || value === null ? "" : String(value).trim();
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function nullableNumberValue(...values: unknown[]) {
  for (const value of values) {
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

function normalizeVessel(value: unknown) {
  const source = pickObject(value);
  const meta = pickObject(source.MetaData);
  const position = pickObject(source.PositionReport);

  const latitude = numberValue(source.latitude, source.lat, source.AIS_Live_Lat, meta.latitude, meta.AIS_Live_Lat, position.Latitude);
  const longitude = numberValue(source.longitude, source.lon, source.lng, source.AIS_Live_Lon, meta.longitude, meta.AIS_Live_Lon, position.Longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 && longitude === 0) return null;

  const mmsi = textValue(source.mmsi, source.MMSI, meta.MMSI);
  const imo = textValue(source.imo, source.IMO, meta.IMO) || (mmsi ? "PENDING" : "");
  const vesselName = textValue(source.vesselName, source.vessel_name, source.ShipName, source.name, meta.ShipName) || "Unknown vessel";
  const shipType = textValue(
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
  ) || "Unknown";
  const dwt = numberValue(source.dwt, source.DWT, meta.dwt, meta.DWT);
  const draft = numberValue(source.draft, source.Draft, meta.draft, meta.Draft);
  const loa = numberValue(source.loa, source.LOA, meta.loa, meta.LOA);
  const speed = numberValue(source.speed_over_ground, source.speedOverGround, source.sog, source.SOG, source.speed, meta.speed_over_ground, meta.speedOverGround, meta.SOG, meta.speed, position.Sog, position.SOG, 12) || 12;
  const destination = textValue(source.destination, source.Destination, meta.Destination) || "N/A";
  const declaredEta = textValue(source.eta, source.ETA, source.Eta, source.estimatedEta, source.etaEstimated, source.eta_calculado, meta.eta, meta.ETA, meta.Eta, meta.estimatedEta, meta.etaEstimated);
  const lastPortOfCall = textValue(source.lastPortOfCall, source.last_port_of_call, source.ultimo_puerto, source.LastPort, source.LastPortOfCall, source.PreviousPort, source.DeparturePort, meta.lastPortOfCall, meta.ultimo_puerto, meta.LastPort, meta.LastPortOfCall, meta.PreviousPort, meta.DeparturePort) || "N/A";
  const designDraft = nullableNumberValue(source.designDraft, source.maxDraft, source.MaximumStaticDraught, meta.designDraft, meta.maxDraft, meta.MaximumStaticDraught);

  return { source, vesselName, mmsi, imo, shipType, dwt, draft, designDraft, loa, speed, destination, declaredEta, lastPortOfCall, latitude, longitude };
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
    const vesselClassValue = textValue(vesselClassContext.value) || "category:cargo";
    const vessels = Array.isArray(body.radarSnapshot) ? body.radarSnapshot : [];
    const loadingPortLat = numberValue(cargo.loadingPortLat);
    const loadingPortLon = numberValue(cargo.loadingPortLon);
    const laycanStart = parseLaycanStart(cargo.laycanStart);
    const laycanEnd = parseLaycanEnd(cargo.laycanEnd);
    const quantity = numberValue(cargo.quantity);
    const cargoSpecification = textValue(cargo.cargoSpecification, cargo.cargoType, cargo.tipoCarga, cargo.tipo_carga);
    const cargoTypeId = textValue(cargo.cargoTypeId, cargo.typeId, body.cargoTypeId) || "100";
    const gearedRequired = cargo.gearedRequired === true;
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

    const vessels_buffer = vessels
      .map(normalizeVessel)
      .filter((vessel): vessel is NonNullable<ReturnType<typeof normalizeVessel>> => Boolean(vessel))
      .filter((vessel) => vesselMatchesTaxonomy(vessel, vesselClassValue));

    const evaluatedMatches = vessels_buffer
      .map((vessel) => {
        const cementSignal = classifyCementCarrierCandidate(vessel);
        const distance = haversineNm(loadingPortLat, loadingPortLon, vessel.latitude, vessel.longitude);
        const speedOverGround = Math.max(vessel.speed, 1);
        const hoursToLoadPort = distance / speedOverGround;
        const daysToLoadPort = hoursToLoadPort / 24;
        const etaDate = new Date(Date.now() + hoursToLoadPort * 60 * 60 * 1000);
        const declaredEtaDate = parseDateValue(vessel.declaredEta);
        const etaDriftHours = declaredEtaDate
          ? Math.round(Math.abs(declaredEtaDate.getTime() - etaDate.getTime()) / 36_000) / 100
          : null;
        const loadState = inferLoadState(vessel.draft, vessel.designDraft, maxDraft);
        const laycan = windowScore(etaDate, laycanStart, laycanEnd);
        const draftOk = vessel.draft <= 0 || vessel.draft <= maxDraft;
        const loaOk = vessel.loa <= 0 || vessel.loa <= maxLoa;
        const dateOk = laycan.ok;
        const technicalEligibility = evaluateCargoVesselEligibility({
          cargoTypeId,
          vessel: vessel.source,
          shipType: vessel.shipType,
          dwt: vessel.dwt,
          quantity,
          gearedRequired,
          grabRequired,
          requiredGrabCapacityCbm,
          requiredCraneSwlMt,
          draftOk,
          loaOk,
          dateOk,
        });
        const capacityOk = technicalEligibility.dwt.vessel !== null
          && technicalEligibility.dwt.vessel >= technicalEligibility.dwt.required
          && (technicalEligibility.dwt.maximumSuitable === null || technicalEligibility.dwt.vessel <= technicalEligibility.dwt.maximumSuitable);
        const etaConsistencyScore = etaDriftHours === null ? 8 : etaDriftHours <= 12 ? 10 : etaDriftHours <= 36 ? 6 : 2;
        const calculatedTechnical = (capacityOk ? 20 : 6) + (draftOk ? 10 : 0) + (loaOk ? 10 : 0) + loadState.score + laycan.score + etaConsistencyScore;
        const taxonomyScoring = calculateTaxonomyTechnicalScore(cargoSpecification, vessel.source, calculatedTechnical);
        const taxonomyCompatibility = taxonomyScoring.compatibility;
        const cargoIntelligence = calculateCargoIntelligenceBoost(cargoTypeId, vessel.source);
        const technical = taxonomyScoring.technicalScore;
        const boostedTechnicalBeforeEligibility = taxonomyCompatibility.compatible
          ? Math.min(100, technical + cargoIntelligence.boost)
          : technical;
        const boostedTechnical = technicalEligibility.eligible
          ? boostedTechnicalBeforeEligibility
          : Math.min(20, boostedTechnicalBeforeEligibility);
        const economic = Math.max(0, 100 - distance / 35);
        const risk = Math.max(0, 100 - Math.max(0, daysToLoadPort - 7) * 8 * riskCoefficient);
        const overall = Math.round(Math.min(100, boostedTechnical * 0.55 + economic * 0.30 + risk * 0.15));
        const ballastFuelCost = distance * (fuelPrice / 100);
        const suggestedFreightRate = freightRate > 0 ? freightRate : Math.max(0, (ballastFuelCost + portExpenses + dailyOpex) / Math.max(quantity, 1));
        const idealVessel = technicalEligibility.eligible && taxonomyCompatibility.compatible && loadState.ballastReady;

        return {
          vessel: {
            vesselName: vessel.vesselName,
            vessel_name: vessel.vesselName,
            imo: vessel.imo,
            mmsi: vessel.mmsi,
            dwt: vessel.dwt,
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
          },
          ais: {
            mmsi: vessel.mmsi,
            imo: vessel.imo,
            latitude: vessel.latitude,
            longitude: vessel.longitude,
            currentDistanceToLoadPort: Math.round(distance),
            daysToLoadPort: Math.round(daysToLoadPort * 10) / 10,
            speed_over_ground: speedOverGround,
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
            draft: vessel.draft,
            designDraft: vessel.designDraft,
            loadState: loadState.state,
            estado_carga: loadState.state,
            loa: vessel.loa,
            cementCarrierClassification: cementSignal,
          },
          routing: {
            eta: etaDate.toISOString(),
            ballastDistanceNM: Math.round(distance),
            daysToLoadPort: Math.round(daysToLoadPort * 10) / 10,
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
            draftOk,
            loaOk,
            cranesOk: true,
            gearOk: !gearedRequired || technicalEligibility.equipment.hasGears === true,
            grabOk: !grabRequired || technicalEligibility.equipment.hasGrab === true,
            holdOk: true,
            dateOk,
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
              taxonomy: taxonomyCompatibility.compatible
                ? "Taxonomía carga-buque compatible"
                : `Taxonomía incompatible: ${cargoSpecification || "carga no especificada"} no admite ${taxonomyCompatibility.declaredVesselType}`,
              technicalEligibility: technicalEligibility.eligible
                ? "Elegibilidad técnica estricta superada"
                : technicalEligibility.criticalReasons.join("; "),
            },
          },
          scores: { technical: boostedTechnical, economic, risk, overall, cargoBoost: cargoIntelligence.boost },
          cargoIntelligence,
          technicalEligibility,
          aiStatus: !technicalEligibility.eligible || !taxonomyCompatibility.compatible ? "INCOMPATIBLE" : idealVessel && overall > 55 && cementSignal.level !== "possible" ? "IDEAL" : overall > 50 ? "MATCH" : "REVIEW",
          idealVessel,
          cementCarrierClassification: cementSignal,
          eta_puerto_carga: etaDate.toISOString(),
          destino_actual: vessel.destination,
          ultimo_puerto: vessel.lastPortOfCall,
          timestamp: Date.now(),
        };
      })
      .filter((match) => match.ais.currentDistanceToLoadPort <= matchRadiusNm)
      .sort((a, b) => Number(b.technicalEligibility.eligible) - Number(a.technicalEligibility.eligible)
        || b.scores.overall - a.scores.overall
        || a.ais.currentDistanceToLoadPort - b.ais.currentDistanceToLoadPort);
    const matches = evaluatedMatches.filter((match) => match.technicalEligibility.eligible);
    const technicalWarnings = evaluatedMatches.filter((match) => !match.technicalEligibility.eligible);

    return Response.json({
      success: true,
      data: matches,
      technicalWarnings,
      eligibleCount: matches.length,
      technicalWarningCount: technicalWarnings.length,
      evaluatedCount: evaluatedMatches.length,
      snapshot: { frozenAt: body.frozenAt || new Date().toISOString(), vesselCount: vessels_buffer.length },
      memory: { knownVesselsSaved: evaluatedMatches.length },
    }, { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Matching engine failed";
    return Response.json({ success: false, error: message, data: [] }, { status: 400, headers: jsonHeaders });
  }
};

export const config: Config = {
  path: ["/api/ai-ais-filter", "/.netlify/functions/ai-ais-filter"],
};
