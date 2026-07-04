import type { Config } from "@netlify/functions";

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

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusNm = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radiusNm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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
  "type:cement": ["cement"],
  "type:mpv": ["multipurpose", "mpp"],
  "type:heavy_lift": ["heavy lift"],
  "category:tanker": ["tanker", "crude", "lng", "lpg", "chemical", "product tanker", "oil"],
  "type:crude_tanker": ["crude", "oil tanker"],
  "type:lng_tanker": ["lng"],
  "type:chemical_tanker": ["chemical"],
  "type:product_tanker": ["product tanker"],
  "type:lpg_tanker": ["lpg"],
};

function vesselMatchesTaxonomy(vessel: NonNullable<ReturnType<typeof normalizeVessel>>, taxonomyValue: string) {
  if (!taxonomyValue || taxonomyValue === "All") return true;
  const terms = taxonomyTerms[taxonomyValue] || taxonomyTerms[taxonomyValue.replace(/^type:/, "")] || [taxonomyValue.replace(/^type:/, "")];
  const haystack = normalizeTaxonomyText([
    vessel.shipType,
    vessel.source.Tipo,
    vessel.source.type,
    vessel.source.vesselType,
    vessel.source.cargoType,
    vessel.source.tipo_carga,
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
  const shipType = textValue(source.shipType, source.ShipType, source.vesselClass, meta.ShipType, meta.shipType) || "Bulk Carrier";
  const dwt = numberValue(source.dwt, source.DWT, meta.dwt, meta.DWT);
  const draft = numberValue(source.draft, source.Draft, meta.draft, meta.Draft);
  const loa = numberValue(source.loa, source.LOA, meta.loa, meta.LOA);
  const speed = numberValue(source.speed, meta.speed, position.Sog, 12) || 12;
  const destination = textValue(source.destination, source.Destination, meta.Destination) || "N/A";
  const lastPortOfCall = textValue(source.lastPortOfCall, source.last_port_of_call, source.ultimo_puerto, source.LastPort, source.LastPortOfCall, source.PreviousPort, source.DeparturePort, meta.lastPortOfCall, meta.ultimo_puerto, meta.LastPort, meta.LastPortOfCall, meta.PreviousPort, meta.DeparturePort) || "N/A";

  return { source, vesselName, mmsi, imo, shipType, dwt, draft, loa, speed, destination, lastPortOfCall, latitude, longitude };
}

function parseLaycanEnd(value: unknown) {
  const parsed = Date.parse(textValue(value));
  if (Number.isFinite(parsed)) return new Date(parsed + 24 * 60 * 60 * 1000);
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
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
    const laycanEnd = parseLaycanEnd(cargo.laycanEnd);
    const quantity = numberValue(cargo.quantity);
    const maxDraft = numberValue(cargo.maxDraft) || Number.POSITIVE_INFINITY;
    const maxLoa = numberValue(cargo.maxLoa) || Number.POSITIVE_INFINITY;
    const freightRate = numberValue(cargo.freightRate);
    const bunkerMultiplier = numberValue(vesselClassProfile.bunkerMultiplier, 1) || 1;
    const riskCoefficient = numberValue(vesselClassProfile.riskCoefficient, 1) || 1;
    const fuelPrice = (numberValue(params.fuelPrice, 650) || 650) * bunkerMultiplier;
    const dailyOpex = numberValue(params.dailyOpex, 6500) || 6500;
    const portExpenses = (numberValue(params.portExpenses, 40000) || 40000) * riskCoefficient;

    if (!Number.isFinite(loadingPortLat) || !Number.isFinite(loadingPortLon)) {
      return Response.json({ success: false, error: "Invalid loading port coordinates", data: [] }, { status: 400, headers: jsonHeaders });
    }

    const matches = vessels
      .map(normalizeVessel)
      .filter((vessel): vessel is NonNullable<ReturnType<typeof normalizeVessel>> => Boolean(vessel))
      .filter((vessel) => vesselMatchesTaxonomy(vessel, vesselClassValue))
      .map((vessel) => {
        const distance = haversineNm(loadingPortLat, loadingPortLon, vessel.latitude, vessel.longitude);
        const hoursToLoadPort = distance / Math.max(vessel.speed, 1);
        const etaDate = new Date(Date.now() + hoursToLoadPort * 60 * 60 * 1000);
        const capacityOk = vessel.dwt <= 0 || quantity <= 0 || vessel.dwt >= quantity * 0.85;
        const draftOk = vessel.draft <= 0 || vessel.draft <= maxDraft;
        const loaOk = vessel.loa <= 0 || vessel.loa <= maxLoa;
        const dateOk = etaDate <= laycanEnd;
        const technical = (capacityOk ? 30 : 10) + (draftOk ? 20 : 0) + (loaOk ? 15 : 0) + (dateOk ? 20 : 8);
        const economic = Math.max(0, 100 - distance / 35);
        const risk = Math.max(0, 100 - Math.max(0, hoursToLoadPort / 24 - 7) * 8 * riskCoefficient);
        const overall = Math.round(Math.min(100, technical * 0.55 + economic * 0.30 + risk * 0.15));
        const ballastFuelCost = distance * (fuelPrice / 100);
        const suggestedFreightRate = freightRate > 0 ? freightRate : Math.max(0, (ballastFuelCost + portExpenses + dailyOpex) / Math.max(quantity, 1));

        return {
          vessel: {
            vesselName: vessel.vesselName,
            vessel_name: vessel.vesselName,
            imo: vessel.imo,
            mmsi: vessel.mmsi,
            dwt: vessel.dwt,
            draft: vessel.draft,
            loa: vessel.loa,
            vesselClass: vessel.shipType,
            specialtyType: vessel.shipType,
            destination: vessel.destination,
            Destination: vessel.destination,
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
            plannedDestination: vessel.destination,
            destination: vessel.destination,
            Destination: vessel.destination,
            lastPortOfCall: vessel.lastPortOfCall,
            last_port_of_call: vessel.lastPortOfCall,
            ultimo_puerto: vessel.lastPortOfCall,
            eta_puerto_carga: etaDate.toISOString(),
            dwt: vessel.dwt,
            draft: vessel.draft,
            loa: vessel.loa,
          },
          routing: {
            eta: etaDate.toISOString(),
            ballastDistanceNM: Math.round(distance),
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
            holdOk: true,
            dateOk,
            reasons: {},
          },
          scores: { technical, economic, risk, overall },
          aiStatus: overall > 50 ? "MATCH" : "REVIEW",
          eta_puerto_carga: etaDate.toISOString(),
          destino_actual: vessel.destination,
          ultimo_puerto: vessel.lastPortOfCall,
          timestamp: Date.now(),
        };
      })
      .filter((match) => match.scores.overall > 0)
      .sort((a, b) => b.scores.overall - a.scores.overall || a.ais.currentDistanceToLoadPort - b.ais.currentDistanceToLoadPort)
      .slice(0, 50);

    return Response.json({
      success: true,
      data: matches,
      snapshot: { frozenAt: body.frozenAt || new Date().toISOString(), vesselCount: vessels.length },
      memory: { knownVesselsSaved: matches.length },
    }, { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Matching engine failed";
    return Response.json({ success: false, error: message, data: [] }, { status: 400, headers: jsonHeaders });
  }
};

export const config: Config = {
  path: "/api/ai-ais-filter",
};
