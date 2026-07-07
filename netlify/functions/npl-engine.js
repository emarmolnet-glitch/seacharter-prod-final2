import OpenAI from "openai";
import sharp from "sharp";

const CARGO_PROMPT = "Extrae solo datos de cargas: Commodity, cantidad, POL, POD. Devuelve JSON";
const VESSEL_PROMPT = `Analiza la tabla de la imagen. Tu tarea es mapear los datos de cada barco a dos salidas distintas:

Salida A (JSON): Datos técnicos normalizados para base de datos.

Salida B (PDF): Lista ordenada bajo los encabezados visuales [Ship, IMO / Type, DWT, Capacity, Gear, Rating, Open Date, T/C INDEX, OFFERS, DISP OWNER].

Eres un experto en extracción de datos marítimos. Identifica que es una tabla con múltiples filas. No intentes procesar un solo buque. Itera por todas las filas visibles de la tabla de la derecha.

Para la Salida A, extrae datos técnicos siguiendo estrictamente este esquema por buque: imo, vesselName, dwt, hasGears, flag, lastPort, vesselType, yearBuilt, ownerManager, etaPuertoCarga.

Para la Salida B, conserva los valores visuales visibles para el informe PDF: Ship, IMO / Type, DWT, Capacity, Gear, Rating, Open Date, T/C INDEX, OFFERS, DISP OWNER.

Si detectas 10 barcos, el JSON técnico debe devolver una lista con 10 objetos y la lista PDF debe devolver 10 filas.

Importante: Añade un campo al principio del JSON llamado totalVesselsDetected con el número total de barcos encontrados.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

const MAX_BASE64_BYTES = 18 * 1024 * 1024;
const SCREENSHOT_WIDTH_THRESHOLD = 1500;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function inferMimeType(fileName) {
  const extension = String(fileName || "").split(".").pop()?.toLowerCase();
  const mimeByExtension = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
  };
  return mimeByExtension[extension] || "application/octet-stream";
}

function normalizeBase64(value) {
  const raw = String(value || "").trim();
  const dataUrlMatch = raw.match(/^data:([^;,]+)?;base64,(.*)$/);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1] || "",
      base64: dataUrlMatch[2],
    };
  }
  return { mimeType: "", base64: raw };
}

function normalizeNullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "si", "sí", "y", "geared", "con gruas", "con grúas"].includes(text)) return true;
  if (["false", "no", "n", "gearless", "sin gruas", "sin grúas"].includes(text)) return false;
  return null;
}

function normalizeCargo(cargo = {}) {
  return {
    commodity: normalizeNullableString(cargo.commodity ?? cargo.Commodity),
    quantity: normalizeNullableString(cargo.quantity ?? cargo.cantidad ?? cargo.volume ?? cargo.volumen),
    pol: normalizeNullableString(cargo.pol ?? cargo.POL),
    pod: normalizeNullableString(cargo.pod ?? cargo.POD),
  };
}

function normalizeVessel(vessel = {}) {
  return {
    imo: normalizeNullableString(vessel.imo),
    vesselName: normalizeNullableString(vessel.vesselName),
    dwt: normalizeNumber(vessel.dwt),
    hasGears: normalizeBoolean(vessel.hasGears),
    flag: normalizeNullableString(vessel.flag),
    lastPort: normalizeNullableString(vessel.lastPort),
    vesselType: normalizeNullableString(vessel.vesselType),
    yearBuilt: normalizeNumber(vessel.yearBuilt),
    ownerManager: normalizeNullableString(vessel.ownerManager),
    etaPuertoCarga: normalizeNullableString(vessel.etaPuertoCarga),
  };
}

function normalizePdfRow(row = {}) {
  return {
    ship: normalizeNullableString(row.ship ?? row.Ship ?? row.vesselName),
    imoType: normalizeNullableString(row.imoType ?? row["IMO / Type"] ?? row.imo ?? row.vesselType),
    dwtCapacity: normalizeNullableString(row.dwtCapacity ?? row["DWT / Capacity"] ?? row.dwt ?? row.capacity),
    gear: normalizeNullableString(row.gear ?? row.Gear ?? row.hasGears),
    ratingOpenDate: normalizeNullableString(row.ratingOpenDate ?? row["Rating / Open Date"] ?? row.rating ?? row.openDate),
    tcIndexOffers: normalizeNullableString(row.tcIndexOffers ?? row["T/C INDEX / OFFERS"] ?? row.tcIndex ?? row.offers),
    dispOwner: normalizeNullableString(row.dispOwner ?? row["DISP OWNER"] ?? row.ownerManager),
  };
}

function buildImageUserContent({ label, fileContent, mimeType }) {
  const dataUrl = `data:${mimeType};base64,${fileContent}`;
  return [
    { type: "input_text", text: `${label}. Extrae solo datos visibles. Si no hay datos, devuelve null. No inventes datos.` },
    { type: "input_image", image_url: dataUrl },
  ];
}

function cargoSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      cargoes: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            commodity: { type: ["string", "null"] },
            quantity: { type: ["string", "null"] },
            pol: { type: ["string", "null"] },
            pod: { type: ["string", "null"] },
          },
          required: ["commodity", "quantity", "pol", "pod"],
        },
      },
    },
    required: ["cargoes"],
  };
}

function vesselSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      totalVesselsDetected: { type: "number" },
      vessels: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            imo: { type: ["string", "null"] },
            vesselName: { type: ["string", "null"] },
            dwt: { type: ["number", "null"] },
            hasGears: { type: ["boolean", "null"] },
            flag: { type: ["string", "null"] },
            lastPort: { type: ["string", "null"] },
            vesselType: { type: ["string", "null"] },
            yearBuilt: { type: ["number", "null"] },
            ownerManager: { type: ["string", "null"] },
            etaPuertoCarga: { type: ["string", "null"] },
          },
          required: ["imo", "vesselName", "dwt", "hasGears", "flag", "lastPort", "vesselType", "yearBuilt", "ownerManager", "etaPuertoCarga"],
        },
      },
      pdfRows: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ship: { type: ["string", "null"] },
            imoType: { type: ["string", "null"] },
            dwtCapacity: { type: ["string", "null"] },
            gear: { type: ["string", "null"] },
            ratingOpenDate: { type: ["string", "null"] },
            tcIndexOffers: { type: ["string", "null"] },
            dispOwner: { type: ["string", "null"] },
          },
          required: ["ship", "imoType", "dwtCapacity", "gear", "ratingOpenDate", "tcIndexOffers", "dispOwner"],
        },
      },
    },
    required: ["totalVesselsDetected", "vessels", "pdfRows"],
  };
}

async function analyzeJson({ client, prompt, content, schema, schemaName }) {
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    input: [
      { role: "system", content: `${prompt}\nSi no hay datos verificables, devuelve null en el campo principal. No inventes datos.` },
      { role: "user", content },
    ],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema,
      },
    },
  });

  return JSON.parse(response.output_text || "null");
}

async function splitScreenshotIfNeeded({ fileContent, mimeType }) {
  if (!mimeType.startsWith("image/")) return null;

  const source = Buffer.from(fileContent, "base64");
  const image = sharp(source, { failOn: "none" });
  const metadata = await image.metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (width <= SCREENSHOT_WIDTH_THRESHOLD || !height) {
    return { width, height, isScreenshot: false };
  }

  const leftWidth = Math.floor(width / 2);
  const rightWidth = width - leftWidth;
  const [leftBuffer, rightBuffer] = await Promise.all([
    sharp(source, { failOn: "none" })
      .extract({ left: 0, top: 0, width: leftWidth, height })
      .png()
      .toBuffer(),
    sharp(source, { failOn: "none" })
      .extract({ left: leftWidth, top: 0, width: rightWidth, height })
      .png()
      .toBuffer(),
  ]);

  return {
    width,
    height,
    isScreenshot: true,
    left: leftBuffer.toString("base64"),
    right: rightBuffer.toString("base64"),
    mimeType: "image/png",
  };
}

function hasAnyMeaningfulCargo(cargo) {
  return Boolean(cargo && (cargo.commodity || cargo.quantity || cargo.pol || cargo.pod));
}

function hasAnyMeaningfulVessel(vessel) {
  return Boolean(vessel && (vessel.imo || vessel.vesselName || vessel.dwt || vessel.hasGears !== null || vessel.lastPort || vessel.etaPuertoCarga));
}

function hasAnyMeaningfulPdfRow(row) {
  return Boolean(row && (row.ship || row.imoType || row.dwtCapacity || row.gear || row.ratingOpenDate || row.tcIndexOffers || row.dispOwner));
}

function normalizeVesselResult(vesselResult) {
  const vessels = Array.isArray(vesselResult?.vessels)
    ? vesselResult.vessels.map(normalizeVessel).filter(hasAnyMeaningfulVessel)
    : [];
  const pdfRows = Array.isArray(vesselResult?.pdfRows)
    ? vesselResult.pdfRows.map(normalizePdfRow).filter(hasAnyMeaningfulPdfRow)
    : [];
  const detected = normalizeNumber(vesselResult?.totalVesselsDetected);
  return {
    totalVesselsDetected: Number.isFinite(detected) ? detected : vessels.length,
    vessels: vessels.length ? vessels : null,
    pdfRows: pdfRows.length ? pdfRows : null,
  };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo no permitido. Usa POST." }, 405);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON invalido." }, 400);
  }

  const fileName = normalizeNullableString(payload?.fileName);
  const normalized = normalizeBase64(payload?.fileContent);
  const fileContent = normalized.base64;

  if (!fileName || !fileContent) {
    return jsonResponse({ error: "Se requieren fileName y fileContent en Base64." }, 400);
  }

  if (Buffer.byteLength(fileContent, "utf8") > MAX_BASE64_BYTES) {
    return jsonResponse({ error: "El archivo excede el tamano maximo permitido para procesamiento NPL." }, 413);
  }

  const mimeType = normalized.mimeType || inferMimeType(fileName);

  try {
    const client = new OpenAI();
    const screenshot = await splitScreenshotIfNeeded({ fileContent, mimeType });

    if (screenshot?.isScreenshot) {
      const [cargoResult, vesselResult] = await Promise.all([
        analyzeJson({
          client,
          prompt: CARGO_PROMPT,
          content: buildImageUserContent({ label: "Mitad IZQUIERDA de captura Shipnext", fileContent: screenshot.left, mimeType: screenshot.mimeType }),
          schema: cargoSchema(),
          schemaName: "npl_cargo_extraction",
        }),
        analyzeJson({
          client,
          prompt: VESSEL_PROMPT,
          content: buildImageUserContent({ label: "Mitad DERECHA de captura Shipnext", fileContent: screenshot.right, mimeType: screenshot.mimeType }),
          schema: vesselSchema(),
          schemaName: "npl_vessel_extraction",
        }),
      ]);

      const cargoes = Array.isArray(cargoResult?.cargoes)
        ? cargoResult.cargoes.map(normalizeCargo).filter(hasAnyMeaningfulCargo)
        : null;
      const vesselPayload = normalizeVesselResult(vesselResult);

      if (!cargoes?.length && !vesselPayload.vessels?.length) return jsonResponse(null);

      return jsonResponse({
        totalVesselsDetected: vesselPayload.totalVesselsDetected,
        cargoes: cargoes?.length ? cargoes : null,
        vessels: vesselPayload.vessels,
        pdfRows: vesselPayload.pdfRows,
        preprocessing: {
          mode: "split-vertical",
          originalWidth: screenshot.width,
          originalHeight: screenshot.height,
        },
      });
    }

    if (mimeType.startsWith("image/")) {
      const vesselResult = await analyzeJson({
        client,
        prompt: VESSEL_PROMPT,
        content: buildImageUserContent({ label: "Imagen completa", fileContent, mimeType }),
        schema: vesselSchema(),
        schemaName: "npl_vessel_extraction",
      });
      const vesselPayload = normalizeVesselResult(vesselResult);

      return vesselPayload.vessels?.length
        ? jsonResponse({
            totalVesselsDetected: vesselPayload.totalVesselsDetected,
            cargoes: null,
            vessels: vesselPayload.vessels,
            pdfRows: vesselPayload.pdfRows,
            preprocessing: { mode: "full-image" },
          })
        : jsonResponse(null);
    }

    return jsonResponse(null);
  } catch (error) {
    console.error("NPL engine OpenAI processing failed:", error?.message || error);
    return jsonResponse({ error: "No se pudo procesar el documento con el Motor NPL." }, 502);
  }
}
