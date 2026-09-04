import { GoogleGenAI } from "@google/genai";
import { neon } from "@neondatabase/serverless";
import { getDatabase } from "../lib/postgres-database.js";
import {
    describeMarketOverrideValues,
    extractMarketOverrideValues,
    hasMarketOverrideValues,
    upsertManualMarketIntelligence,
} from "../lib/market-manual-ingestion.js";
import { enrichCalculationData, enrichVoyagePayload } from "../lib/voyage-audit-state.js";
import {
    buildPersistedPdaReply,
    extractPdaLookupContext,
    isPdaCostQuestion,
    mapPdaConfirmationToCostBreakdown,
} from "../lib/pda-costs.js";

export { buildPersistedPdaReply, isPdaCostQuestion, mapPdaConfirmationToCostBreakdown } from "../lib/pda-costs.js";

// --- LIBRERÍAS DE LECTURA DE ARCHIVOS ---
import * as xlsx from "xlsx"; 
import mammoth from "mammoth"; 
import { Buffer } from "node:buffer";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import {
    buildProjectCargoConfirmation,
    CEREBRO_RESPONSE_SCHEMA,
    hasProjectCargoEvidence,
    mergeProjectCargoIntoPayload,
    normalizeProjectCargoExtraction,
} from "../lib/project-cargo.js";
import {
    applyExplicitCargoToPayload,
    buildCargoInjectionConfirmation,
    detectExplicitCargo,
} from "../lib/cargo-classification.js";

const MAX_ATTACHMENT_COUNT = 4;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|pdf|xlsx?|csv|docx)$/i;
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_TIMEOUT_MS = 45000;
const GEMINI_PROVIDER_TIMEOUT_MS = 43000;

export const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

export const MARKET_DATA_SCHEMA = {
    description: "Market Intel para contrastar el flete con costes, mercado y riesgo contractual",
    type: "object",
    properties: {}
};

export function isEmptyCalculationData(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
}

export function findCalculationData(value, visited = new Set()) {
    if (!value || typeof value !== "object" || visited.has(value)) return null;
    visited.add(value);
    for (const directValue of [value.CalculationData, value.calculationData]) {
        if (!isEmptyCalculationData(directValue)) return directValue;
    }
    for (const nestedValue of Object.values(value)) {
        const calculationData = findCalculationData(nestedValue, visited);
        if (!isEmptyCalculationData(calculationData)) return calculationData;
    }
    return null;
}

export function mapCommercialDossierToCalculationData(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const blackBoxPayload = row.black_box_payload && typeof row.black_box_payload === "object" && !Array.isArray(row.black_box_payload) ? row.black_box_payload : null;
    const embeddedCalculationData = findCalculationData(blackBoxPayload) ?? findCalculationData(row);
    const calculationPayload = !isEmptyCalculationData(embeddedCalculationData) ? embeddedCalculationData : !isEmptyCalculationData(blackBoxPayload) ? blackBoxPayload : Object.fromEntries(Object.entries(row).filter(([key]) => key !== "black_box_payload"));
    
    if (isEmptyCalculationData(calculationPayload)) return null;
    
    const normalizedCalculationData = calculationPayload && typeof calculationPayload === "object" && !Array.isArray(calculationPayload) ? { ...calculationPayload } : { value: calculationPayload };
    
    normalizedCalculationData.dossier_context = {
        dossier_id: row.dossier_id ?? null,
        imo_number: row.imo_number ?? null,
        audit_status: row.audit_status ?? null,
        risk_score: row.risk_score ?? null,
        commercial_grade: row.commercial_grade ?? null,
        analyst_notes: row.analyst_notes ?? null,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null
    };
    return enrichCalculationData(normalizedCalculationData);
}

function resolveDatabaseUrl() {
    return process.env.DATABASE_URL_WRITE
        || process.env.DATABASE_WRITE_URL
        || process.env.DATABASE_URL
        || process.env.NEON_DATABASE_URL
        || process.env.NETLIFY_DB_URL;
}

export async function loadLatestCalculationData(databaseUrl = resolveDatabaseUrl(), sqlFactory = neon) {
    if (!databaseUrl) return null;
    const sql = sqlFactory(databaseUrl);
    const rows = await sql`SELECT * FROM commercial_dossiers ORDER BY created_at DESC NULLS LAST, dossier_id DESC LIMIT 1`;
    return mapCommercialDossierToCalculationData(rows[0]);
}

export async function loadLatestPdaCostBreakdown(context = {}, databaseUrl = resolveDatabaseUrl(), sqlFactory = neon) {
    if (!databaseUrl) return null;
    const sql = sqlFactory(databaseUrl);
    const estimationId = String(context.estimationId ?? context.estimation_id ?? "").trim();
    const imoNumber = String(context.imoNumber ?? context.imo_number ?? context.imo ?? "").replace(/\D/g, "");
    const pol = String(context.pol ?? context.POL ?? "").trim();
    const pod = String(context.pod ?? context.POD ?? "").trim();
    const queries = [];
    if (estimationId) {
        queries.push(() => sql`SELECT id, estimation_id, vessel_name, imo_number, pol, pod, financial_breakdown, created_at FROM pda_vessel_confirmations WHERE estimation_id = ${estimationId} AND financial_breakdown IS NOT NULL ORDER BY created_at DESC LIMIT 1`);
    }
    if (imoNumber) {
        queries.push(() => sql`SELECT id, estimation_id, vessel_name, imo_number, pol, pod, financial_breakdown, created_at FROM pda_vessel_confirmations WHERE imo_number::text = ${imoNumber} AND financial_breakdown IS NOT NULL ORDER BY created_at DESC LIMIT 1`);
    }
    if (pol && pod) {
        queries.push(() => sql`SELECT id, estimation_id, vessel_name, imo_number, pol, pod, financial_breakdown, created_at FROM pda_vessel_confirmations WHERE LOWER(pol) = LOWER(${pol}) AND LOWER(pod) = LOWER(${pod}) AND financial_breakdown IS NOT NULL ORDER BY created_at DESC LIMIT 1`);
    }
    queries.push(() => sql`SELECT id, estimation_id, vessel_name, imo_number, pol, pod, financial_breakdown, created_at FROM pda_vessel_confirmations WHERE financial_breakdown IS NOT NULL ORDER BY created_at DESC LIMIT 1`);

    for (const query of queries) {
        const rows = await query();
        const breakdown = mapPdaConfirmationToCostBreakdown(rows[0]);
        if (breakdown) return breakdown;
    }
    return null;
}

export async function loadLatestMarketSentiment(databaseUrl = resolveDatabaseUrl(), sqlFactory = neon) {
    if (!databaseUrl) return null;
    try {
        const sql = sqlFactory(databaseUrl);
        const rows = await sql`SELECT * FROM market_sentiments ORDER BY timestamp DESC LIMIT 1`;
        return rows[0] || null;
    } catch (error) {
        console.warn("[cerebro-ia] No se pudo cargar el sentimiento de mercado:", error instanceof Error ? error.message : String(error));
        return null;
    }
}

export async function injectCalculationFallback(payload, fallbackLoader = loadLatestCalculationData, pdaLoader = loadLatestPdaCostBreakdown) {
    const normalizedPayload = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : {};
    const existingDataBridgeStatus = normalizedPayload.DataBridgeStatus;
    const dataBridgeStatus = existingDataBridgeStatus && typeof existingDataBridgeStatus === "object" && !Array.isArray(existingDataBridgeStatus) ? existingDataBridgeStatus : {};
    const receivedCalculationData = normalizedPayload.calculationData ?? normalizedPayload.CalculationData;
    if (isPdaCostQuestion(normalizedPayload)) {
        try {
            const persistedPdaBreakdown = await pdaLoader(extractPdaLookupContext(normalizedPayload));
            if (persistedPdaBreakdown) {
                normalizedPayload.CalculationData = {
                    ...(!isEmptyCalculationData(receivedCalculationData) && typeof receivedCalculationData === "object" ? receivedCalculationData : {}),
                    pda_cost_breakdown: persistedPdaBreakdown,
                };
                normalizedPayload.DataBridgeStatus = { ...dataBridgeStatus, calculation: "available", calculation_source: "neon_pda_confirmation", pda_costs: "available" };
                return enrichVoyagePayload(normalizedPayload);
            }
        } catch (error) {
            console.warn("[cerebro-ia] Neon PDA breakdown unavailable", error instanceof Error ? error.message : String(error));
        }
    }
    if (!isEmptyCalculationData(receivedCalculationData)) {
        normalizedPayload.CalculationData = receivedCalculationData;
        normalizedPayload.DataBridgeStatus = { ...dataBridgeStatus, calculation: "available", calculation_source: "request" };
        return enrichVoyagePayload(normalizedPayload);
    }
    try {
        const recoveredCalculationData = await fallbackLoader();
        if (!isEmptyCalculationData(recoveredCalculationData)) {
            normalizedPayload.CalculationData = recoveredCalculationData;
            normalizedPayload.DataBridgeStatus = { ...dataBridgeStatus, calculation: "available", calculation_source: "neon_fallback" };
            return enrichVoyagePayload(normalizedPayload);
        }
    } catch (error) {
        console.warn("[cerebro-ia] Neon CalculationData fallback unavailable", error instanceof Error ? error.message : String(error));
    }
    normalizedPayload.DataBridgeStatus = { ...dataBridgeStatus, calculation: "unavailable", calculation_source: "none" };
    return normalizedPayload;
}

export async function persistAiMarketPayload(payload, database = getDatabase()) {
    return upsertManualMarketIntelligence(database, payload);
}

const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTRACT_REF_TEXT_REGEX = /\b((?:RDM|EXP|EXPEDIENTE|VOY|VOYAGE|DOSSIER|EST|CP|CTR|FIX)[\/\-][A-Z0-9][A-Z0-9\/\-]{2,})\b/i;
const CONTRACT_REF_PLACEHOLDERS = new Set(["", "null", "undefined", "nan", "{}", "[]", "n/a", "na", "none", "false", "0"]);

export const CONTRACT_REF_KEYS = [
    "contract_ref", "contractRef", "referencia", "reference", "ref", "ref_number", "refNumber", "expediente", "activeReference", "active_reference", "voyage_reference", "voyageReference", "active_voyage_reference", "last_voyage_reference", "voyage_ref", "voyageRef", "last_known_expediente", "last_expediente", "active_expediente", "target_session_id", "target_session", "sessionRef", "sessionId", "session_id", "currentSessionId", "core_pro_active_session", "active_core_pro_session",
];

const CONTRACT_REF_CONTAINER_KEYS = [
    "CalculationData", "calculationData", "payload", "session", "sessionState", "activeSession", "coreProSession", "core_pro_session", "voyage", "voyageContext", "voyage_context", "context", "UserContext", "DataBridgeStatus", "dataBridgeStatus", "dossier", "dossier_context", "selectedVessel", "SelectedVessel", "state", "globalState",
];

export function normalizeContractRef(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().replace(/\s+/g, " ");
}

export function isCommercialContractRef(value) {
    const trimmed = normalizeContractRef(value);
    if (!trimmed || CONTRACT_REF_PLACEHOLDERS.has(trimmed.toLowerCase())) return false;
    if (trimmed.length > 120) return false;
    if (UUID_LIKE_REGEX.test(trimmed)) return false;
    if (/^(?:RDM|EXP|EXPEDIENTE|VOY|VOYAGE|DOSSIER|EST|CP|CTR|FIX)[\/\-]/i.test(trimmed)) return true;
    if (/^[A-Z0-9_-]{2,}\/[A-Z0-9_\/-]+$/i.test(trimmed)) return true;
    if (/^[A-Z]{2,}-[A-Z0-9-]*\d[A-Z0-9-]*$/i.test(trimmed)) return true;
    return false;
}

export function extractContractRefFromText(text) {
    if (typeof text !== "string" || !text) return "";
    const match = text.match(CONTRACT_REF_TEXT_REGEX);
    if (!match) return "";
    const candidate = normalizeContractRef(match[1]).replace(/[.,;:)\]]+$/, "");
    return isCommercialContractRef(candidate) ? candidate : "";
}

export function findContractRefDeep(source, depth = 0, visited = new Set()) {
    if (depth > 6 || source === null || source === undefined) return "";
    if (typeof source === "string") {
        const trimmed = source.trim();
        if (!trimmed) return "";
        if (isCommercialContractRef(trimmed)) return normalizeContractRef(trimmed);
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                return findContractRefDeep(JSON.parse(trimmed), depth + 1, visited);
            } catch {
                return extractContractRefFromText(trimmed);
            }
        }
        return extractContractRefFromText(trimmed);
    }
    if (typeof source !== "object") return "";
    if (visited.has(source)) return "";
    visited.add(source);
    if (Array.isArray(source)) {
        for (const item of source) {
            const found = findContractRefDeep(item, depth + 1, visited);
            if (found) return found;
        }
        return "";
    }
    for (const key of CONTRACT_REF_KEYS) {
        const candidate = source[key];
        if (typeof candidate === "string" && isCommercialContractRef(candidate)) {
            return normalizeContractRef(candidate);
        }
    }
    for (const key of CONTRACT_REF_CONTAINER_KEYS) {
        if (!(key in source)) continue;
        const found = findContractRefDeep(source[key], depth + 1, visited);
        if (found) return found;
    }
    for (const [key, value] of Object.entries(source)) {
        if (CONTRACT_REF_CONTAINER_KEYS.includes(key)) continue;
        if (!value || typeof value !== "object") continue;
        const found = findContractRefDeep(value, depth + 1, visited);
        if (found) return found;
    }
    return "";
}

export function collectRequestText(requestBody = {}) {
    return [
        requestBody.message,
        requestBody.current_message,
        requestBody.mensaje,
        requestBody.UserContext,
        requestBody.prompt,
    ]
        .filter(value => typeof value === "string" && value.trim())
        .join("\n");
}

export function resolveContractRefFromRequest(requestBody = {}, aiPayload = null) {
    const explicitFromAi = findContractRefDeep(aiPayload, 5);
    if (explicitFromAi) return { contractRef: explicitFromAi, source: "ai_payload" };
    const fromText = extractContractRefFromText(collectRequestText(requestBody));
    if (fromText) return { contractRef: fromText, source: "message_text" };
    for (const key of CONTRACT_REF_KEYS) {
        const candidate = requestBody?.[key];
        if (typeof candidate === "string" && isCommercialContractRef(candidate)) {
            return { contractRef: normalizeContractRef(candidate), source: "request_field" };
        }
    }
    const inherited = findContractRefDeep(requestBody);
    if (inherited) return { contractRef: inherited, source: "session_state" };
    return { contractRef: "", source: "unresolved" };
}

export function extractImoFromSource(source, depth = 0, visited = new Set()) {
    if (depth > 5 || !source || typeof source !== "object") return "";
    if (visited.has(source)) return "";
    visited.add(source);
    if (Array.isArray(source)) {
        for (const item of source) {
            const found = extractImoFromSource(item, depth + 1, visited);
            if (found) return found;
        }
        return "";
    }
    for (const key of ["imo_number", "imoNumber", "imo", "IMO", "vessel_imo", "vesselImo"]) {
        const digits = String(source[key] ?? "").replace(/\D/g, "");
        if (/^\d{7}$/.test(digits)) return digits;
    }
    for (const value of Object.values(source)) {
        if (!value || typeof value !== "object") continue;
        const found = extractImoFromSource(value, depth + 1, visited);
        if (found) return found;
    }
    return "";
}

export function extractVesselNameFromSource(source, depth = 0, visited = new Set()) {
    if (depth > 5 || !source || typeof source !== "object") return "";
    if (visited.has(source)) return "";
    visited.add(source);
    if (Array.isArray(source)) {
        for (const item of source) {
            const found = extractVesselNameFromSource(item, depth + 1, visited);
            if (found) return found;
        }
        return "";
    }
    for (const key of ["vessel_name", "vesselName", "buque", "shipName", "ship_name", "name"]) {
        const candidate = typeof source[key] === "string" ? source[key].trim() : "";
        if (candidate && candidate.toUpperCase() !== "N/A" && candidate.length <= 160) return candidate;
    }
    for (const value of Object.values(source)) {
        if (!value || typeof value !== "object") continue;
        const found = extractVesselNameFromSource(value, depth + 1, visited);
        if (found) return found;
    }
    return "";
}

async function runFirstSuccessfulQuery(queries) {
    for (const query of queries) {
        try {
            const rows = await query();
            if (Array.isArray(rows) && rows.length > 0) return rows[0];
        } catch (error) {
            console.warn("[cerebro-ia] Variante de consulta descartada:", error instanceof Error ? error.message : String(error));
        }
    }
    return null;
}

export async function loadVoyageTrackingRow(sql, contractRef = "") {
    if (typeof sql !== "function") return null;
    const ref = normalizeContractRef(contractRef);
    if (ref) {
        return runFirstSuccessfulQuery([
            () => sql`SELECT id, contract_ref, imo_number, vessel_name, current_status, updated_at FROM voyages_tracking WHERE UPPER(TRIM(contract_ref)) = UPPER(TRIM(${ref}::text)) ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`,
            () => sql`SELECT id, contract_ref, imo_number FROM voyages_tracking WHERE UPPER(TRIM(contract_ref)) = UPPER(TRIM(${ref}::text)) ORDER BY id DESC LIMIT 1`,
        ]);
    }
    return runFirstSuccessfulQuery([
        () => sql`SELECT id, contract_ref, imo_number, vessel_name, current_status, updated_at FROM voyages_tracking WHERE contract_ref IS NOT NULL AND TRIM(contract_ref) <> '' AND COALESCE(UPPER(TRIM(current_status)), '') <> 'DRAFT' ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`,
        () => sql`SELECT id, contract_ref, imo_number, vessel_name, updated_at FROM voyages_tracking WHERE contract_ref IS NOT NULL AND TRIM(contract_ref) <> '' ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`,
        () => sql`SELECT id, contract_ref, imo_number FROM voyages_tracking WHERE contract_ref IS NOT NULL AND TRIM(contract_ref) <> '' ORDER BY id DESC LIMIT 1`,
    ]);
}

export async function resolveVesselNameByImo(sql, imoNumber) {
    const imo = String(imoNumber ?? "").replace(/\D/g, "");
    if (typeof sql !== "function" || !imo) return "";
    const row = await runFirstSuccessfulQuery([
        () => sql`SELECT vessel_name FROM vessels_master WHERE imo_number::text = ${imo} OR imo::text = ${imo} ORDER BY fecha_ultima_actualizacion DESC NULLS LAST, id DESC LIMIT 1`,
        () => sql`SELECT vessel_name FROM vessels_master WHERE imo_number::text = ${imo} ORDER BY id DESC LIMIT 1`,
        () => sql`SELECT vessel_name FROM ais_vessels WHERE imo::text = ${imo} ORDER BY id DESC LIMIT 1`,
    ]);
    const name = typeof row?.vessel_name === "string" ? row.vessel_name.trim() : "";
    return name && name.toUpperCase() !== "N/A" ? name : "";
}

export async function resolveImoByVesselName(sql, vesselName) {
    const name = typeof vesselName === "string" ? vesselName.trim() : "";
    if (typeof sql !== "function" || !name) return "";
    const row = await runFirstSuccessfulQuery([
        () => sql`SELECT imo_number FROM vessels_master WHERE UPPER(TRIM(vessel_name)) = UPPER(TRIM(${name}::text)) AND imo_number IS NOT NULL AND imo_number <> 0 ORDER BY fecha_ultima_actualizacion DESC NULLS LAST, id DESC LIMIT 1`,
    ]);
    const digits = String(row?.imo_number ?? "").replace(/\D/g, "");
    return /^\d{7}$/.test(digits) ? digits : "";
}

export async function resolveImoFromDossiers(sql, contractRef = "") {
    if (typeof sql !== "function") return "";
    const ref = normalizeContractRef(contractRef);
    const row = await runFirstSuccessfulQuery([
        ...(ref ? [() => sql`SELECT imo_number FROM commercial_dossiers WHERE imo_number IS NOT NULL AND UPPER(COALESCE(black_box_payload::text, '')) LIKE UPPER('%' || TRIM(${ref}::text) || '%') ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, dossier_id DESC LIMIT 1`] : []),
        () => sql`SELECT imo_number FROM commercial_dossiers WHERE imo_number IS NOT NULL ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, dossier_id DESC LIMIT 1`,
    ]);
    const digits = String(row?.imo_number ?? "").replace(/\D/g, "");
    return /^\d{7}$/.test(digits) ? digits : "";
}

export async function resolveActiveVoyageContext({ requestBody = {}, aiPayload = null, sql = null } = {}) {
    const resolution = resolveContractRefFromRequest(requestBody, aiPayload);
    const context = {
        contractRef: resolution.contractRef,
        contractRefSource: resolution.source,
        imoNumber: extractImoFromSource(aiPayload) || extractImoFromSource(requestBody),
        vesselName: extractVesselNameFromSource(aiPayload?.selectedVessel ?? null) || extractVesselNameFromSource(requestBody.selectedVessel ?? requestBody.SelectedVessel ?? null),
        voyageRow: null,
        identitySource: "none",
    };
    if (typeof sql !== "function") return context;
    try {
        const row = await loadVoyageTrackingRow(sql, context.contractRef);
        if (row) {
            context.voyageRow = row;
            const rowRef = normalizeContractRef(row.contract_ref);
            if (!context.contractRef && rowRef) {
                context.contractRef = rowRef;
                context.contractRefSource = "neon_active_voyage";
            } else if (rowRef) {
                context.contractRef = rowRef;
            }
            const rowImo = String(row.imo_number ?? "").replace(/\D/g, "");
            if (/^\d{7}$/.test(rowImo)) {
                context.imoNumber = rowImo;
                context.identitySource = "voyages_tracking";
            }
            const rowVessel = typeof row.vessel_name === "string" ? row.vessel_name.trim() : "";
            if (rowVessel && rowVessel.toUpperCase() !== "N/A") context.vesselName = rowVessel;
        }
        if (!context.imoNumber) {
            const dossierImo = await resolveImoFromDossiers(sql, context.contractRef);
            if (dossierImo) {
                context.imoNumber = dossierImo;
                context.identitySource = "commercial_dossiers";
            }
        }
        if (!context.imoNumber && context.vesselName) {
            const imoByName = await resolveImoByVesselName(sql, context.vesselName);
            if (imoByName) {
                context.imoNumber = imoByName;
                context.identitySource = "vessels_master";
            }
        }
        if (context.imoNumber && !context.vesselName) {
            const resolvedName = await resolveVesselNameByImo(sql, context.imoNumber);
            if (resolvedName) context.vesselName = resolvedName;
        }
    } catch (error) {
        console.warn("[cerebro-ia] No se pudo resolver el contexto del viaje en Neon:", error instanceof Error ? error.message : String(error));
    }
    return context;
}

export async function ensureLaytimeSchema(sql) {
    if (typeof sql !== "function") return false;
    await sql`
        CREATE TABLE IF NOT EXISTS laytime_statements (
            id SERIAL PRIMARY KEY,
            contract_ref VARCHAR(255) NOT NULL,
            operation VARCHAR(50) NOT NULL,
            quantity_mt NUMERIC DEFAULT 0,
            rate_mt_day NUMERIC,
            allowed_hours NUMERIC,
            laytime_rule VARCHAR(50),
            weather_permitting BOOLEAN DEFAULT true,
            once_on_demurrage BOOLEAN DEFAULT true,
            commencement_delay_minutes INTEGER DEFAULT 0,
            port_time_zone VARCHAR(50),
            demurrage_rate_usd_day NUMERIC DEFAULT 0,
            nor_tendered_at TIMESTAMP,
            nor_accepted_at TIMESTAMP,
            laytime_commenced_at TIMESTAMP,
            operation_started_at TIMESTAMP,
            operation_completed_at TIMESTAMP,
            statement_as_of_at TIMESTAMP,
            incidents JSONB DEFAULT '[]'::jsonb,
            calculation JSONB DEFAULT '{}'::jsonb,
            status VARCHAR(50),
            allowed_seconds INTEGER DEFAULT 0,
            used_seconds INTEGER DEFAULT 0,
            excluded_seconds INTEGER DEFAULT 0,
            balance_seconds INTEGER DEFAULT 0,
            demurrage_usd NUMERIC DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `;
    await sql`
        ALTER TABLE laytime_statements
            ADD COLUMN IF NOT EXISTS quantity_mt NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS rate_mt_day NUMERIC,
            ADD COLUMN IF NOT EXISTS allowed_hours NUMERIC,
            ADD COLUMN IF NOT EXISTS used_hours NUMERIC,
            ADD COLUMN IF NOT EXISTS excluded_hours NUMERIC,
            ADD COLUMN IF NOT EXISTS balance_hours NUMERIC,
            ADD COLUMN IF NOT EXISTS allowed_seconds INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS used_seconds INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS excluded_seconds INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS balance_seconds INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS demurrage_rate_usd_day NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS demurrage_usd NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS laytime_rule VARCHAR(50),
            ADD COLUMN IF NOT EXISTS port_time_zone VARCHAR(50),
            ADD COLUMN IF NOT EXISTS nor_tendered_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS nor_accepted_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS laytime_commenced_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS operation_started_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS operation_completed_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS statement_as_of_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS incidents JSONB DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS calculation JSONB DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS status VARCHAR(50),
            ADD COLUMN IF NOT EXISTS imo_number BIGINT,
            ADD COLUMN IF NOT EXISTS vessel_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS contract_ref_source VARCHAR(50),
            ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `;
    await Promise.all([
        sql`CREATE INDEX IF NOT EXISTS idx_laytime_contract ON laytime_statements (UPPER(contract_ref));`,
        sql`CREATE INDEX IF NOT EXISTS idx_laytime_contract_operation ON laytime_statements (UPPER(TRIM(contract_ref)), UPPER(TRIM(operation)));`,
        sql`CREATE INDEX IF NOT EXISTS idx_laytime_imo ON laytime_statements (imo_number);`,
    ]);
    return true;
}

export function parseOperationalDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number" && Number.isFinite(value)) {
        const fromNumber = new Date(value);
        return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
    }
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(trimmed) ? trimmed.replace(" ", "T") : trimmed;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parsePositiveNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const numeric = typeof value === "number" ? value : Number(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

const SECONDS_PER_HOUR = 3600;

export function computeLaytimeMetrics({
    quantityMt = 0,
    rateMtDay = 0,
    norTenderedAt = null,
    laytimeCommencedAt = null,
    operationStartedAt = null,
    operationCompletedAt = null,
    statementAsOfAt = null,
    excludedHours = 0,
    demurrageRateUsdDay = 0,
    now = new Date(),
} = {}) {
    const quantity = parsePositiveNumber(quantityMt);
    const rate = parsePositiveNumber(rateMtDay);
    const norDate = parseOperationalDate(norTenderedAt);
    const commencedDate = parseOperationalDate(laytimeCommencedAt);
    const startedDate = parseOperationalDate(operationStartedAt);
    const completedDate = parseOperationalDate(operationCompletedAt);
    const asOfDate = parseOperationalDate(statementAsOfAt);

    const hasAllowance = quantity > 0 && rate > 0;
    const allowedHours = hasAllowance ? (quantity / rate) * 24 : null;
    const allowedSeconds = allowedHours === null ? null : Math.round(allowedHours * SECONDS_PER_HOUR);

    const countingFrom = commencedDate || startedDate || norDate || null;
    const countingTo = completedDate || asOfDate || (countingFrom ? now : null);

    const excludedSeconds = Math.max(0, Math.round(parsePositiveNumber(excludedHours) * SECONDS_PER_HOUR));
    const grossUsedSeconds = countingFrom && countingTo ? Math.max(0, Math.floor((countingTo.getTime() - countingFrom.getTime()) / 1000)) : null;
    const usedSeconds = grossUsedSeconds === null ? null : Math.max(0, grossUsedSeconds - excludedSeconds);

    const balanceSeconds = allowedSeconds !== null && usedSeconds !== null ? allowedSeconds - usedSeconds : null;
    const onDemurrage = balanceSeconds !== null && balanceSeconds < 0;
    const demurrageRate = parsePositiveNumber(demurrageRateUsdDay);
    const demurrageUsd = onDemurrage && demurrageRate > 0 ? Number(((Math.abs(balanceSeconds) / SECONDS_PER_HOUR / 24) * demurrageRate).toFixed(2)) : 0;
    const status = balanceSeconds === null ? "PENDING_DATA" : onDemurrage ? "DEMURRAGE" : "ON_TIME";
    const toHours = seconds => (seconds === null ? null : Number((seconds / SECONDS_PER_HOUR).toFixed(4)));

    return {
        hasAllowance, hasUsage: usedSeconds !== null, quantityMt: quantity || null, rateMtDay: rate || null,
        allowedHours: allowedHours === null ? null : Number(allowedHours.toFixed(4)), allowedSeconds,
        usedSeconds, usedHours: toHours(usedSeconds), excludedSeconds, excludedHours: toHours(excludedSeconds),
        balanceSeconds, balanceHours: toHours(balanceSeconds), demurrageRateUsdDay: demurrageRate || null,
        demurrageUsd, status, norTenderedAt: norDate, laytimeCommencedAt: commencedDate,
        operationStartedAt: startedDate, operationCompletedAt: completedDate, statementAsOfAt: asOfDate,
        countingFrom, countingTo,
    };
}

const SOF_KEYWORD_REGEX = /(statement of facts|\bsof\b|notice of readiness|\bnor\b|laytime|plancha|demurrage|demora|despatch|dispatch money|all fast|hose (?:on|off)|commenced|commencement|completed (?:loading|discharg)|fin de (?:carga|descarga)|inicio de (?:carga|descarga)|hitos|milestones|atraque|desatraque|fondeo|pilot on board|free pratique|outturn|draft survey)/i;

export function hasSofEvidence(userText = "", payload = null) {
    if (payload && typeof payload === "object") {
        if (Array.isArray(payload.milestones) && payload.milestones.length > 0) return true;
        for (const key of ["norTenderedAt", "nor_tendered_at", "norAcceptedAt", "nor_accepted_at", "laytimeCommencedAt", "laytime_commenced_at", "operationStartedAt", "operation_started_at", "operationCompletedAt", "operation_completed_at", "statementAsOfAt", "statement_as_of_at"]) {
            if (payload[key]) return true;
        }
    }
    return SOF_KEYWORD_REGEX.test(String(userText || ""));
}

export function resolveOperationType(userText = "", payload = null) {
    const explicit = String(payload?.operation ?? payload?.operationType ?? payload?.operation_type ?? "").trim().toUpperCase();
    if (explicit === "LOAD" || explicit === "LOADING") return "LOAD";
    if (explicit === "DISCHARGE" || explicit === "DISCHARGING") return "DISCHARGE";
    const text = String(userText || "").toLowerCase();
    if (/(discharg|descarg|outturn|desestib)/.test(text)) return "DISCHARGE";
    return "LOAD";
}

export async function persistLaytimeStatement(sql, { contractRef, contractRefSource = null, operation, imoNumber = null, vesselName = null, metrics, milestones = null }) {
    const ref = normalizeContractRef(contractRef);
    if (typeof sql !== "function" || !ref) return null;
    const operationType = String(operation || "LOAD").toUpperCase();
    const imo = /^\d{7}$/.test(String(imoNumber ?? "").replace(/\D/g, "")) ? Number(String(imoNumber).replace(/\D/g, "")) : null;
    const vessel = typeof vesselName === "string" && vesselName.trim() ? vesselName.trim() : null;
    const calculationJson = JSON.stringify({
        allowed_hours: metrics.allowedHours, allowed_seconds: metrics.allowedSeconds, used_seconds: metrics.usedSeconds,
        used_hours: metrics.usedHours, excluded_seconds: metrics.excludedSeconds, balance_seconds: metrics.balanceSeconds,
        balance_hours: metrics.balanceHours, demurrage_usd: metrics.demurrageUsd,
        counting_from: metrics.countingFrom ? metrics.countingFrom.toISOString() : null,
        counting_to: metrics.countingTo ? metrics.countingTo.toISOString() : null,
        status: metrics.status, contract_ref: ref, imo_number: imo, vessel_name: vessel,
    });
    const milestonesJson = Array.isArray(milestones) ? JSON.stringify(milestones) : null;

    const updated = await sql`
        UPDATE laytime_statements
        SET quantity_mt = COALESCE(${metrics.quantityMt}::numeric, quantity_mt), rate_mt_day = COALESCE(${metrics.rateMtDay}::numeric, rate_mt_day), allowed_hours = COALESCE(${metrics.allowedHours}::numeric, allowed_hours), allowed_seconds = COALESCE(${metrics.allowedSeconds}::integer, allowed_seconds), used_seconds = COALESCE(${metrics.usedSeconds}::integer, used_seconds), used_hours = COALESCE(${metrics.usedHours}::numeric, used_hours), excluded_seconds = COALESCE(${metrics.excludedSeconds}::integer, excluded_seconds), excluded_hours = COALESCE(${metrics.excludedHours}::numeric, excluded_hours), balance_seconds = COALESCE(${metrics.balanceSeconds}::integer, balance_seconds), balance_hours = COALESCE(${metrics.balanceHours}::numeric, balance_hours), demurrage_rate_usd_day = COALESCE(${metrics.demurrageRateUsdDay}::numeric, demurrage_rate_usd_day), demurrage_usd = COALESCE(${metrics.demurrageUsd}::numeric, demurrage_usd), status = ${metrics.status}::text, nor_tendered_at = COALESCE(${metrics.norTenderedAt}::timestamp, nor_tendered_at), laytime_commenced_at = COALESCE(${metrics.laytimeCommencedAt}::timestamp, laytime_commenced_at), operation_started_at = COALESCE(${metrics.operationStartedAt}::timestamp, operation_started_at), operation_completed_at = COALESCE(${metrics.operationCompletedAt}::timestamp, operation_completed_at), statement_as_of_at = COALESCE(${metrics.statementAsOfAt}::timestamp, statement_as_of_at), imo_number = COALESCE(${imo}::bigint, imo_number), vessel_name = COALESCE(${vessel}::text, vessel_name), contract_ref_source = COALESCE(${contractRefSource}::text, contract_ref_source), milestones = COALESCE(${milestonesJson}::jsonb, milestones), calculation = ${calculationJson}::jsonb, updated_at = NOW()
        WHERE UPPER(TRIM(contract_ref)) = UPPER(TRIM(${ref}::text)) AND UPPER(TRIM(operation)) = UPPER(TRIM(${operationType}::text))
        RETURNING id
    `;
    if (Array.isArray(updated) && updated.length > 0) return { id: updated[0].id, mode: "updated" };
    return null;
}

export async function syncVoyageMilestones(sql, contractRef, milestones) {
    const ref = normalizeContractRef(contractRef);
    if (typeof sql !== "function" || !ref || !Array.isArray(milestones) || milestones.length === 0) return false;
    try {
        const rows = await sql`UPDATE voyages_tracking SET milestones = ${JSON.stringify(milestones)}::jsonb, updated_at = NOW() WHERE UPPER(TRIM(contract_ref)) = UPPER(TRIM(${ref}::text)) RETURNING id`;
        return Array.isArray(rows) && rows.length > 0;
    } catch {
        return false;
    }
}

export const MARITIME_TAXONOMY_MAP = {
  "Carga Unitizada / Envasada": { keywords: ["paletizado", "pallet", "big bag", "sacas", "sacos", "envasado"], defaultEquipment: "Eslingas", isProjectCargo: false },
  "Carga de Proyecto (Breakbulk)": { keywords: ["maquinaria", "project cargo", "breakbulk", "heavy lift", "transformador"], defaultEquipment: "Grúas Heavy Lift", isProjectCargo: true },
  "Minerales y Construcción": { keywords: ["granel", "bulk", "cemento", "cement", "clinker", "escoria", "yeso"], defaultEquipment: "Cuchara (Grab)", isProjectCargo: false },
  "Carga Siderúrgica y Metales": { keywords: ["acero", "bobinas", "coils", "chatarra", "scrap", "tubos", "vigas"], defaultEquipment: "Hierro/Acero - Grúa Barco", isProjectCargo: false }
};

export const DEFAULT_AI_SYSTEM_DIRECTIVE = "Actúa como el motor de inteligencia artificial y análisis predictivo de SeaCharter Data Bridge...";
export const SYSTEM_DIRECTIVE = DEFAULT_AI_SYSTEM_DIRECTIVE;
export const EMAIL_STYLE_GUIDE_BLOCK = [];

export function buildStrategicPrompt(datosDeCorePro, marketSentimentData, hasImage = false, hasDocuments = false, voyageContext = null) {
    const hoy = new Date();
    const strLayday = new Date(hoy.setDate(hoy.getDate() + 3)).toISOString().split('T')[0];
    const strCancelling = new Date(hoy.setDate(hoy.getDate() + 7)).toISOString().split('T')[0];
    const marketContextText = marketSentimentData ? `Sentimiento: ${marketSentimentData.sentiment_score}` : "Sin datos de mercado.";
    const voyageContextText = JSON.stringify({ CalculationData: datosDeCorePro?.CalculationData ?? null }, null, 2);
    const activeContractRef = typeof voyageContext?.contractRef === "string" ? voyageContext.contractRef.trim() : "";
    const activeContractBlock = activeContractRef ? [`Expediente activo: ${activeContractRef}`, `IMO: ${voyageContext?.imoNumber || "N/D"}`] : [];

    return [
        DEFAULT_AI_SYSTEM_DIRECTIVE,
        '',
        ...activeContractBlock,
        '=== REGLAS DE ORO DE EXTRACCION Y RESPUESTA ===',
        '1. 🔴 EXTRACCIÓN AUTÓNOMA (CERO PREGUNTAS): Si el usuario adjunta documentos (BL, SOF, etc.), TIENES ESTRICTAMENTE PROHIBIDO pedirle que te confirme los puertos (POL/POD) o el tonelaje. Lee los archivos, extrae los datos por ti mismo e inyéctalos en el "payload". ¡Cero preguntas!',
        '2. 🔴 PROHIBIDO PEDIR PERMISO: Nunca digas frases como "¿me indicas los puertos?" o "¿te inyecto estos datos?". Actúa de inmediato.',
        '3. 🔴 ACCIÓN: Si hay documentos adjuntos o el usuario pide calcular, usa SIEMPRE "action": "update_fields".',
        '4. 🔴 CONFIRMACIÓN DIRECTA: En tu "reply", confirma de forma breve los datos extraídos e indica que la calculadora ha sido actualizada.',
        '',
        '=== ESTADO GLOBAL ACTUAL DEL VIAJE ===',
        voyageContextText,
        '',
        '=== FORMATO DE SALIDA (JSON ESTRICTO) ===',
        '{',
        '  "memoria_interna": "Análisis completado.",',
        '  "reply": "[Informe y confirmación corta]",',
        '  "action": "[update_fields o none]",',
        '  "projectCargo": { "cargoType": "", "unitWeightMT": 0, "dimensions": { "lengthM": 0, "widthM": 0, "heightM": 0 }, "liftingPoints": false },',
        '  "payload": {',
        '    "tonnage": 0,',
        '    "pol": "",',
        '    "pod": "",',
        '    "laydayStart": "' + strLayday + '",',
        '    "cancelling": "' + strCancelling + '"',
        '  }',
        '}'
    ].join("\n");
}

export function resolveGeminiConfig(env = process.env) {
    const apiKey = String(env.GEMINI_API_KEY || "").trim();
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada.");
    return { apiKey, model: String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() };
}

export function buildFunctionErrorResponse(error) {
    return { status: 503, body: { reply: "Error temporal de IA.", action: "error", payload: {} } };
}

export async function executeWithTimeout(promise, timeoutMs = GEMINI_TIMEOUT_MS) {
    return Promise.race([promise, new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), timeoutMs))]);
}

async function processRequest(request) {
    if (request.method === 'OPTIONS') return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers });
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });

    try {
        let requestBody = {};
        const documentosExtraidos = [];
        const multimodalParts = [];
        const attachmentNames = [];
        let hasImage = false;
        let imagenBase64 = null;

        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const bodyStr = formData.get("body") || formData.get("payload");
            if (bodyStr) { try { requestBody = JSON.parse(bodyStr); } catch {} }

            const uploadedFiles = Array.from(formData.values()).filter(v => v instanceof File && v.size > 0);
            for (const file of uploadedFiles) {
                const buffer = Buffer.from(await file.arrayBuffer());
                attachmentNames.push(file.name);
                if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
                    multimodalParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "application/pdf" } });
                } else if (file.type.startsWith("image/")) {
                    hasImage = true;
                    multimodalParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: file.type } });
                }
            }
        } else {
            requestBody = await request.json();
        }

        imagenBase64 = requestBody.image || requestBody.imagen;

        const neonSql = resolveDatabaseUrl() ? neon(resolveDatabaseUrl()) : null;
        const voyageContext = await resolveActiveVoyageContext({ requestBody, sql: neonSql });
        const datosDeCorePro = await injectCalculationFallback(requestBody);
        const marketSentimentData = await loadLatestMarketSentiment();

        const geminiConfig = resolveGeminiConfig();
        const ai = new GoogleGenAI({ apiKey: geminiConfig.apiKey });

        const promptCompleto = `${buildStrategicPrompt(datosDeCorePro, marketSentimentData, hasImage, multimodalParts.length > 0, voyageContext)}\n\nARCHIVOS RECIBIDOS: ${attachmentNames.join(", ")}`;
        const parts = [{ text: promptCompleto }];
        if (imagenBase64) parts.push({ inlineData: { data: imagenBase64, mimeType: "image/png" } });
        if (multimodalParts.length > 0) parts.push(...multimodalParts);

        const result = await executeWithTimeout(ai.models.generateContent({
            model: geminiConfig.model,
            contents: [{ role: "user", parts }],
            config: { responseMimeType: "application/json", responseJsonSchema: CEREBRO_RESPONSE_SCHEMA, temperature: 0.1 }
        }));

        let rawText = (result.text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
        let aiResponseObject = JSON.parse(rawText);

        if (aiResponseObject?.payload && voyageContext?.contractRef) {
            aiResponseObject.payload.contract_ref = voyageContext.contractRef;
            aiResponseObject.payload.imo_number = voyageContext.imoNumber;
        }

        return new Response(JSON.stringify(aiResponseObject), { status: 200, headers });
    } catch (error) {
        return new Response(JSON.stringify({ reply: "Error procesando la solicitud.", action: "error", payload: {} }), { status: 500, headers });
    }
}

export default processRequest;