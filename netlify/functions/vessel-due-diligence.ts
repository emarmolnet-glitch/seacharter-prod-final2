import type { Config } from "@netlify/functions";
import * as cheerio from "cheerio";
import {
  findVesselTechnicalRecord,
  hasCachedMandatoryTechnicalData,
  upsertVesselTechnicalRecord,
  type VesselTechnicalRecord,
} from "../../db/vessel-technical-cache.js";
import { mappedVesselField, parseVesselAttribute } from "./_shared/vessel-field-mappings.mjs";
import { extractVesselFinderDetailUrl, extractVesselFinderFields } from "./_shared/vesselfinder-extractor.mjs";

type VesselData = {
  imo_number: string | null;
  vessel_name: string | null;
  flag: string | null;
  call_sign: string | null;
  vessel_type: string | null;
  year_built: number | null;
  loa_meters: number | null;
  beam_meters: number | null;
  gross_tonnage: number | null;
  net_tonnage: number | null;
  dwt: number | null;
  last_port: string | null;
  eta: string | null;
};

type LookupIdentity = {
  imo: string;
  mmsi: string;
  vesselName: string;
  query: string;
};

type SourceStatus = "success" | "empty" | "blocked" | "timeout" | "error";

type SearchAttempt = {
  provider: string;
  status: SourceStatus;
  queryType: "imo" | "mmsi" | "vesselName";
};

type SourceResult = {
  status: SourceStatus;
  data: VesselData;
};

type DirectSource = {
  provider: string;
  buildUrls: (identity: LookupIdentity) => URL[];
};

const INTERNAL_DEADLINE_MS = 25_000;
const SOURCE_TIMEOUT_MS = 7_000;
const FIELD_NAMES = [
  "imo_number",
  "vessel_name",
  "flag",
  "call_sign",
  "vessel_type",
  "year_built",
  "loa_meters",
  "beam_meters",
  "gross_tonnage",
  "net_tonnage",
  "dwt",
  "last_port",
  "eta",
] as const;

const DIRECT_SOURCES: DirectSource[] = [
  {
    provider: "VesselFinder",
    buildUrls: (identity) => [
      ...(identity.imo ? [new URL(`https://www.vesselfinder.com/vessels/details/${identity.imo}`)] : []),
      new URL(`https://www.vesselfinder.com/vessels?name=${encodeURIComponent(identity.query)}`),
    ],
  },
  {
    provider: "MarineVesselTraffic",
    buildUrls: (identity) => [
      new URL(`https://www.marinevesseltraffic.com/vessels/${encodeURIComponent(identity.query)}/ship-information`),
      new URL(`https://www.marinevesseltraffic.com/vessels?search=${encodeURIComponent(identity.query)}`),
    ],
  },
  {
    provider: "MarineTraffic",
    buildUrls: (identity) => [
      new URL(`https://www.marinetraffic.com/en/ais/index/search/all/keyword:${encodeURIComponent(identity.query)}`),
    ],
  },
  {
    provider: "BalticShipping",
    buildUrls: (identity) => [
      new URL(`https://www.balticshipping.com/vessels?search=${encodeURIComponent(identity.query)}`),
    ],
  },
];

function emptyVesselData(): VesselData {
  return {
    imo_number: null,
    vessel_name: null,
    flag: null,
    call_sign: null,
    vessel_type: null,
    year_built: null,
    loa_meters: null,
    beam_meters: null,
    gross_tonnage: null,
    net_tonnage: null,
    dwt: null,
    last_port: null,
    eta: null,
  };
}

function cleanText(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function cleanNumber(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeImo(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 7 ? digits : "";
}

function normalizeMmsi(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 9 ? digits : "";
}

function hasValidImoChecksum(imo: string) {
  if (!/^\d{7}$/.test(imo)) return false;
  const digits = imo.split("").map(Number);
  const checksum = digits.slice(0, 6).reduce((sum, digit, index) => sum + digit * (7 - index), 0) % 10;
  return checksum === digits[6];
}

function buildIdentity(body: Record<string, unknown>): LookupIdentity | null {
  const rawImo = normalizeImo(body.imo ?? body.imo_number);
  const imo = rawImo && hasValidImoChecksum(rawImo) ? rawImo : "";
  const mmsi = normalizeMmsi(body.mmsi);
  const vesselName = cleanText(body.vesselName ?? body.vessel_name ?? body.name) || "";
  const query = imo || mmsi || vesselName;
  return query ? { imo, mmsi, vesselName, query } : null;
}

function identityQueryType(identity: LookupIdentity): SearchAttempt["queryType"] {
  if (identity.imo) return "imo";
  if (identity.mmsi) return "mmsi";
  return "vesselName";
}

function valueForField(field: keyof VesselData, value: unknown) {
  if (field === "imo_number") return normalizeImo(value) || null;
  if (field === "vessel_type") {
    return cleanText(value)?.replace(/^(?:vessel|ship)\s+type\s*[:#-]?\s*/i, "") || null;
  }
  if (field === "year_built") {
    const match = String(value ?? "").match(/\b(18|19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
  }
  if (["loa_meters", "beam_meters", "gross_tonnage", "net_tonnage", "dwt"].includes(field)) {
    return cleanNumber(value);
  }
  return cleanText(value);
}

function mergeFirstValues(target: VesselData, incoming: VesselData) {
  for (const field of FIELD_NAMES) {
    if (target[field] === null && incoming[field] !== null) {
      (target[field] as VesselData[typeof field]) = incoming[field];
    }
  }
}

function findStructuredVesselType(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStructuredVesselType(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["vesselType", "vessel_type", "shipType", "ship_type", "vesselClass"]) {
    const candidate = cleanText(record[key]);
    if (candidate) return candidate;
  }
  for (const nested of Object.values(record)) {
    const found = findStructuredVesselType(nested);
    if (found) return found;
  }
  return null;
}

function extractLabeledData(html: string): VesselData {
  const $ = cheerio.load(html);
  const data = emptyVesselData();
  const candidates = new Map<string, string>();

  $("tr, li, [class*='detail'], [class*='info'], [class*='attribute'], [class*='spec']").each((_, element) => {
    const node = $(element);
    const cells = node.children("th, td, dt, dd, div, span");
    if (cells.length >= 2) {
      const label = cleanText($(cells[0]).text());
      const value = cleanText($(cells[cells.length - 1]).text());
      if (label && value) candidates.set(label, value);
    }
  });

  $("dt").each((_, element) => {
    const label = cleanText($(element).text());
    const value = cleanText($(element).next("dd").text());
    if (label && value) candidates.set(label, value);
  });

  $("[data-label], [data-title]").each((_, element) => {
    const node = $(element);
    const label = cleanText(node.attr("data-label") || node.attr("data-title"));
    const value = cleanText(node.text());
    if (label && value) candidates.set(label, value);
  });

  for (const [rawKey, rawValue] of candidates) {
    const parsedAttribute = parseVesselAttribute(rawKey, rawValue) as {
      column: keyof VesselData;
      value: VesselData[keyof VesselData];
    } | null;
    if (parsedAttribute && data[parsedAttribute.column] === null) {
      (data[parsedAttribute.column] as VesselData[typeof parsedAttribute.column]) = parsedAttribute.value;
    }
  }

  const explicitType = cleanText(
    $("[data-field='vessel-type'], [data-field='ship-type'], [data-title*='Vessel Type' i], [data-title*='Ship Type' i], .vessel-type, .ship-type")
      .first()
      .text(),
  );
  if (explicitType) data.vessel_type = valueForField("vessel_type", explicitType) as string | null;

  if (!data.vessel_type) {
    $("script[type='application/ld+json']").each((_, element) => {
      if (data.vessel_type) return false;
      try {
        data.vessel_type = findStructuredVesselType(JSON.parse($(element).text()));
      } catch {
        return undefined;
      }
      return undefined;
    });
  }

  const bodyText = cleanText($("body").text()) || "";
  data.imo_number ||= normalizeImo(bodyText.match(/\bIMO(?:\s+number)?\s*[:#-]?\s*(\d{7})\b/i)?.[1]) || null;
  data.dwt ||= cleanNumber(bodyText.match(/\b(?:DWT|Deadweight)\s*[:#-]?\s*([\d,\.\s]+)\s*(?:MT|t|tonnes)?\b/i)?.[1]);
  data.flag ||= cleanText(bodyText.match(/\bFlag\s*[:#-]\s*([A-Za-z][A-Za-z .'-]{1,40}?)(?=\s+(?:IMO|MMSI|Vessel|Ship|Type|Built|Year|DWT|Deadweight)\b|$)/i)?.[1]);
  data.call_sign ||= cleanText(bodyText.match(/\b(?:Call\s*Sign|Indicativo)\s*[:#-]\s*([A-Za-z0-9-]{2,20})\b/i)?.[1]);
  data.vessel_type ||= cleanText(bodyText.match(/\b(?:Vessel|Ship)\s+Type\s*[:#-]\s*([A-Za-z][A-Za-z0-9 /&.'-]{1,60}?)(?=\s+(?:IMO|MMSI|Flag|Built|Year|DWT|Deadweight)\b|$)/i)?.[1]);
  data.year_built ||= valueForField("year_built", bodyText.match(/\b(?:Year\s+Built|Year\s+of\s+Build|Built)\s*[:#-]?\s*((?:18|19|20)\d{2})\b/i)?.[1]) as number | null;
  data.vessel_name ||= cleanText($("h1").first().text() || $("title").text().split("-")[0]);
  return data;
}

function normalizedIdentityText(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractTableData(html: string, identity: LookupIdentity): VesselData {
  const $ = cheerio.load(html);
  const data = emptyVesselData();
  const expectedValues = [identity.imo, identity.mmsi, identity.vesselName]
    .map(normalizedIdentityText)
    .filter(Boolean);

  $("table").each((_, table) => {
    if (data.dwt !== null && data.imo_number !== null) return false;
    const headers = $(table).find("tr").first().find("th,td").map((__, cell) => cleanText($(cell).text()) || "").get();
    const rows = $(table).find("tr").slice(1).toArray();
    const matchedRow = rows.find((row) => {
      const rowText = normalizedIdentityText($(row).text());
      const rowHtml = normalizedIdentityText($.html(row));
      return expectedValues.some((value) => rowText.includes(value) || rowHtml.includes(value));
    }) || rows[0];
    if (!matchedRow) return undefined;

    const cells = $(matchedRow).find("td").toArray();
    const readCell = (field: keyof VesselData) => {
      const index = headers.findIndex((header) => mappedVesselField(header) === field);
      return index >= 0 && cells[index] ? cleanText($(cells[index]).text()) : null;
    };
    const rowText = cleanText($(matchedRow).text()) || "";
    const rowHtml = $.html(matchedRow);
    const linkText = cleanText($(matchedRow).find("a[href]").first().text());

    const identityText = `${rowHtml} ${rowText}`;
    const rowImo = identityText.match(/IMO[^0-9]*(\d{7})/i)?.[1]
      || identityText.match(/\b(\d{7})\b/)?.[1];
    data.imo_number = normalizeImo(rowImo) || null;
    data.vessel_name = linkText || readCell("vessel_name");
    data.flag = readCell("flag");
    data.call_sign = readCell("call_sign");
    data.vessel_type = readCell("vessel_type");
    const builtText = readCell("year_built");
    const builtMatch = String(builtText ?? "").match(/\b(18|19|20)\d{2}\b/);
    data.year_built = builtMatch ? Number(builtMatch[0]) : null;
    data.loa_meters = cleanNumber(readCell("loa_meters"));
    data.beam_meters = cleanNumber(readCell("beam_meters"));
    data.gross_tonnage = cleanNumber(readCell("gross_tonnage"));
    data.net_tonnage = cleanNumber(readCell("net_tonnage"));
    data.dwt = cleanNumber(readCell("dwt"));
    return undefined;
  });

  return data;
}

function extractVesselData(html: string, identity: LookupIdentity, provider: string) {
  const data = extractLabeledData(html);
  mergeFirstValues(data, extractTableData(html, identity));
  if (provider === "VesselFinder") {
    const vesselFinderData = extractVesselFinderFields(html, identity);
    for (const field of ["flag", "call_sign", "vessel_type", "loa_meters", "beam_meters", "net_tonnage", "last_port", "eta"] as const) {
      if (vesselFinderData[field] !== null) data[field] = vesselFinderData[field];
    }
  }
  return data;
}

function isBlockedPage(html: string) {
  return /access denied|captcha|cloudflare|temporarily blocked|verify you are human/i.test(html);
}

function hasUsefulTechnicalData(data: VesselData) {
  return FIELD_NAMES.some((field) => data[field] !== null);
}

function hasCompleteDueDiligenceData(data: VesselData) {
  return data.imo_number !== null
    && data.dwt !== null
    && data.flag !== null
    && data.vessel_type !== null
    && data.year_built !== null;
}

function hasMandatoryTechnicalData(data: VesselData) {
  return Number(data.gross_tonnage) > 0 && Number(data.loa_meters) > 0;
}

function cachedRecordToVesselData(record: VesselTechnicalRecord | null): VesselData {
  return {
    ...emptyVesselData(),
    imo_number: record?.imoNumber ? String(record.imoNumber) : null,
    vessel_name: record?.vesselName || null,
    flag: record?.flag || null,
    call_sign: record?.callSign || null,
    vessel_type: record?.vesselType || null,
    year_built: record?.yearBuilt || null,
    loa_meters: Number(record?.loaMeters) > 0 ? Number(record?.loaMeters) : null,
    beam_meters: Number(record?.beamMeters) > 0 ? Number(record?.beamMeters) : null,
    gross_tonnage: Number(record?.grossTonnage) > 0 ? Number(record?.grossTonnage) : null,
    net_tonnage: Number(record?.netTonnage) > 0 ? Number(record?.netTonnage) : null,
    dwt: Number(record?.dwt) > 0 ? Number(record?.dwt) : null,
    last_port: record?.lastPort || null,
    eta: record?.eta || null,
  };
}

function vesselDataToTechnicalRecord(data: VesselData, identity: LookupIdentity): VesselTechnicalRecord {
  const imo = normalizeImo(data.imo_number || identity.imo);
  return {
    imoNumber: imo ? Number(imo) : null,
    mmsi: identity.mmsi || null,
    vesselName: data.vessel_name || identity.vesselName || null,
    dwt: data.dwt === null ? null : Math.trunc(data.dwt),
    latitude: null,
    longitude: null,
    vesselType: data.vessel_type,
    draftMeters: null,
    flag: data.flag,
    callSign: data.call_sign,
    yearBuilt: data.year_built,
    grossTonnage: data.gross_tonnage,
    netTonnage: data.net_tonnage,
    loaMeters: data.loa_meters,
    beamMeters: data.beam_meters,
    lastPort: data.last_port,
    eta: data.eta,
  };
}

async function fetchDirectSource(
  source: DirectSource,
  identity: LookupIdentity,
  deadlineAt: number,
): Promise<SourceResult> {
  const combined = emptyVesselData();
  const pendingUrls = source.buildUrls(identity);
  const visitedUrls = new Set<string>();
  for (let index = 0; index < pendingUrls.length; index += 1) {
    const url = pendingUrls[index];
    if (visitedUrls.has(url.href)) continue;
    visitedUrls.add(url.href);
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) return { status: "timeout", data: combined };
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "SeaCharterCorePRO/1.0 vessel-due-diligence",
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9,es;q=0.8",
        },
        signal: AbortSignal.timeout(Math.min(SOURCE_TIMEOUT_MS, remainingMs)),
      });
      if (!response.ok) continue;
      const html = await response.text();
      if (isBlockedPage(html)) {
        return { status: hasUsefulTechnicalData(combined) ? "success" : "blocked", data: combined };
      }
      if (source.provider === "VesselFinder") {
        const detailPath = extractVesselFinderDetailUrl(html, identity);
        if (detailPath) {
          const detailUrl = new URL(detailPath, url);
          if (!visitedUrls.has(detailUrl.href) && !pendingUrls.some((candidate) => candidate.href === detailUrl.href)) {
            pendingUrls.push(detailUrl);
          }
        }
      }
      mergeFirstValues(combined, extractVesselData(html, identity, source.provider));
      const vesselFinderDetailPending = source.provider === "VesselFinder"
        && pendingUrls.slice(index + 1).some((candidate) => candidate.pathname.includes("/vessels/details/"));
      if (!vesselFinderDetailPending && hasCompleteDueDiligenceData(combined) && hasMandatoryTechnicalData(combined)) {
        return { status: "success", data: combined };
      }
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        return { status: hasUsefulTechnicalData(combined) ? "success" : "timeout", data: combined };
      }
    }
  }
  return { status: hasUsefulTechnicalData(combined) ? "success" : "empty", data: combined };
}

async function runSourceWaterfall(identity: LookupIdentity, deadlineAt: number, cachedData: VesselData) {
  const attempts: SearchAttempt[] = [];
  const combinedData = cachedData;
  const successfulProviders: string[] = [];

  for (const source of DIRECT_SOURCES) {
    if (Date.now() >= deadlineAt) break;
    const result = await fetchDirectSource(source, identity, deadlineAt);
    attempts.push({ provider: source.provider, status: result.status, queryType: identityQueryType(identity) });
    if (result.status === "success") {
      successfulProviders.push(source.provider);
      mergeFirstValues(combinedData, result.data);
      if (hasCompleteDueDiligenceData(combinedData) && hasMandatoryTechnicalData(combinedData)) break;
    }
  }

  const timedOut = Date.now() >= deadlineAt || attempts.some((attempt) => attempt.status === "timeout");
  return {
    provider: successfulProviders.length ? successfulProviders.join(" + ") : null,
    status: successfulProviders.length ? "success" : timedOut ? "timeout" : attempts.at(-1)?.status ?? "empty",
    data: combinedData,
    attempts,
    timedOut,
    extracted: successfulProviders.length > 0,
  };
}

function verificationLog(data: VesselData, provider: string | null) {
  return FIELD_NAMES.filter((field) => data[field] !== null).map((field) => ({
    field,
    provider,
    verified: true,
  }));
}

function normalizedResponseData(data: VesselData) {
  return {
    ...data,
    imo: data.imo_number,
    vesselType: data.vessel_type,
    builtYear: data.year_built,
  };
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, Accept",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

export default async (req: Request) => {
  const requestStartedAt = Date.now();
  const deadlineAt = requestStartedAt + INTERNAL_DEADLINE_MS;
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405, headers);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const identity = body ? buildIdentity(body) : null;
  const localOnly = body?.localOnly === true;
  const externalOnly = body?.externalOnly === true;
  if (!identity) {
    return json({ success: false, error: "Se requiere al menos un IMO válido, MMSI o nombre del buque." }, 400, headers);
  }

  let cachedRecord: VesselTechnicalRecord | null = null;
  let cacheLookupFailed = false;
  if (!externalOnly) {
    try {
      cachedRecord = await findVesselTechnicalRecord(
        identity.imo ? Number(identity.imo) : null,
        identity.mmsi || null,
        identity.vesselName || null,
      );
    } catch (error) {
      cacheLookupFailed = true;
      console.error("[vessel-due-diligence] Local vessel cache lookup failed", error);
    }
  }

  const cachedData = cachedRecordToVesselData(cachedRecord);
  if (localOnly) {
    if (cacheLookupFailed) {
      return json({
        success: false,
        error: "No se pudo consultar el registro maestro de Data Bridge en Neon.",
      }, 503, headers);
    }
    if (!cachedRecord) {
      return json({
        success: false,
        error: "No se encontró el registro maestro de Data Bridge en Neon.",
      }, 404, headers);
    }
    return json({
      success: true,
      data: normalizedResponseData(cachedData),
      verificationLog: verificationLog(cachedData, "vessels_master"),
      meta: {
        mode: "local-database-cache",
        provider: "vessels_master",
        status: "success",
        attempts: [],
        timedOut: false,
        partial: Object.values(cachedData).some((value) => value === null),
        identity: {
          queryType: identityQueryType(identity),
          imo: identity.imo || null,
          mmsi: identity.mmsi || null,
          vesselName: identity.vesselName || null,
        },
        elapsedMs: Date.now() - requestStartedAt,
      },
    }, 200, headers);
  }
  if (!externalOnly && hasCachedMandatoryTechnicalData(cachedRecord)) {
    return json({
      success: true,
      data: normalizedResponseData(cachedData),
      verificationLog: verificationLog(cachedData, "vessels_master"),
      meta: {
        mode: "local-database-cache",
        provider: "vessels_master",
        status: "success",
        attempts: [],
        timedOut: false,
        partial: Object.values(cachedData).some((value) => value === null),
        identity: {
          queryType: identityQueryType(identity),
          imo: identity.imo || null,
          mmsi: identity.mmsi || null,
          vesselName: identity.vesselName || null,
        },
        elapsedMs: Date.now() - requestStartedAt,
      },
    }, 200, headers);
  }

  const result = await runSourceWaterfall(identity, deadlineAt, externalOnly ? emptyVesselData() : cachedData);
  let grossTonnageRecoveredFromMaster = false;
  if (externalOnly && !Number(result.data.gross_tonnage)) {
    try {
      cachedRecord = await findVesselTechnicalRecord(
        identity.imo ? Number(identity.imo) : null,
        identity.mmsi || null,
        identity.vesselName || null,
      );
      const grossTonnageFallback = cachedRecordToVesselData(cachedRecord);
      grossTonnageRecoveredFromMaster = Number(grossTonnageFallback.gross_tonnage) > 0;
      mergeFirstValues(result.data, grossTonnageFallback);
    } catch (error) {
      console.error("[vessel-due-diligence] Gross tonnage fallback lookup failed", error);
    }
  }
  if (!externalOnly && result.extracted && hasUsefulTechnicalData(result.data)) {
    try {
      await upsertVesselTechnicalRecord(vesselDataToTechnicalRecord(result.data, identity));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown database error";
      console.error("[vessel-due-diligence] Automatic technical persistence failed", error);
      return json({
        success: false,
        error: `La extracción finalizó, pero no se pudo consolidar vessels_master: ${errorMessage}`,
        data: normalizedResponseData(result.data),
      }, 500, headers);
    }
  }

  return json({
    success: true,
    data: normalizedResponseData(result.data),
    verificationLog: verificationLog(result.data, result.provider),
    meta: {
      mode: externalOnly ? "public-source-audit" : "public-source-waterfall",
      provider: result.provider,
      status: result.status,
      grossTonnageRecoveredFromMaster,
      grossTonnageRequired: !Number(result.data.gross_tonnage),
      persisted: !externalOnly && result.extracted && hasUsefulTechnicalData(result.data),
      requiresAcceptance: externalOnly,
      attempts: result.attempts,
      timedOut: result.timedOut,
      partial: Object.values(result.data).some((value) => value === null),
      identity: {
        queryType: identityQueryType(identity),
        imo: identity.imo || null,
        mmsi: identity.mmsi || null,
        vesselName: identity.vesselName || null,
      },
      elapsedMs: Date.now() - requestStartedAt,
    },
  }, 200, headers);
};

export const config: Config = {
  path: "/api/vessel-due-diligence",
  method: ["POST", "OPTIONS"],
};
