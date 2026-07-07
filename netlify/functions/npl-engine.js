import OpenAI from "openai";
import sharp from "sharp";

const CARGO_PROMPT = "Extrae solo datos de cargas: Commodity, cantidad, POL, POD. Devuelve JSON";
const VESSEL_PROMPT = `Analiza imagenes de tablas de buques bajo estas reglas estrictas:

Ignora encabezados y pies de pagina.

Extrae todas las filas visibles de buques. No proceses un solo buque si hay multiples filas.

Extrae obligatoriamente estos 13 campos por cada buque: ship, imo, type, dwt, capacity, gear, rating, open_date, tc_index, offers, disp_owner, freight_cost, remarks.

Si un dato falta, usa exactamente "N/A".

La salida debe ser UNICAMENTE un objeto JSON estructurado como {"vessels": [...]}.

No incluyas explicaciones ni texto adicional.`;

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
    ship: normalizeNullableString(vessel.ship ?? vessel.vesselName ?? vessel.Ship) || "N/A",
    imo: normalizeNullableString(vessel.imo ?? vessel.IMO) || "N/A",
    type: normalizeNullableString(vessel.type ?? vessel.vesselType ?? vessel.Type) || "N/A",
    dwt: normalizeNullableString(vessel.dwt ?? vessel.DWT) || "N/A",
    capacity: normalizeNullableString(vessel.capacity ?? vessel.Capacity) || "N/A",
    gear: normalizeNullableString(vessel.gear ?? vessel.Gear ?? vessel.hasGears) || "N/A",
    rating: normalizeNullableString(vessel.rating ?? vessel.Rating) || "N/A",
    open_date: normalizeNullableString(vessel.open_date ?? vessel.openDate ?? vessel.etaPuertoCarga ?? vessel["Open Date"]) || "N/A",
    tc_index: normalizeNullableString(vessel.tc_index ?? vessel.tcIndex ?? vessel["T/C INDEX"]) || "N/A",
    offers: normalizeNullableString(vessel.offers ?? vessel.Offers ?? vessel.OFFERS) || "N/A",
    disp_owner: normalizeNullableString(vessel.disp_owner ?? vessel.dispOwner ?? vessel.ownerManager ?? vessel["DISP OWNER"]) || "N/A",
    freight_cost: normalizeNullableString(vessel.freight_cost ?? vessel.freightCost ?? vessel["Freight Cost"]) || "N/A",
    remarks: normalizeNullableString(vessel.remarks ?? vessel.Remarks) || "N/A",
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
  const vesselProperties = {
    ship: { type: "string" },
    imo: { type: "string" },
    type: { type: "string" },
    dwt: { type: "string" },
    capacity: { type: "string" },
    gear: { type: "string" },
    rating: { type: "string" },
    open_date: { type: "string" },
    tc_index: { type: "string" },
    offers: { type: "string" },
    disp_owner: { type: "string" },
    freight_cost: { type: "string" },
    remarks: { type: "string" },
  };
  const requiredVesselFields = Object.keys(vesselProperties);
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      vessels: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: vesselProperties,
          required: requiredVesselFields,
        },
      },
    },
    required: ["vessels"],
  };
}

async function analyzeJson({ client, prompt, content, schema, schemaName }) {
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    input: [
      { role: "system", content: prompt },
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
  return Boolean(vessel && Object.values(vessel).some((value) => value !== "N/A"));
}

function hasAnyMeaningfulPdfRow(row) {
  return Boolean(row && (row.ship || row.imoType || row.dwtCapacity || row.gear || row.ratingOpenDate || row.tcIndexOffers || row.dispOwner));
}

function normalizeVesselResult(vesselResult) {
  const vessels = Array.isArray(vesselResult?.vessels)
    ? vesselResult.vessels.map(normalizeVessel).filter(hasAnyMeaningfulVessel)
    : [];
  return {
    vessels,
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

      if (!cargoes?.length && !vesselPayload.vessels?.length) return jsonResponse({ vessels: [] });

      return jsonResponse({ vessels: vesselPayload.vessels || [] });
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
        ? jsonResponse({ vessels: vesselPayload.vessels })
        : jsonResponse({ vessels: [] });
    }

    return jsonResponse({ vessels: [] });
  } catch (error) {
    console.error("NPL engine OpenAI processing failed:", error?.message || error);
    return jsonResponse({ error: "No se pudo procesar el documento con el Motor NPL." }, 502);
  }
}
