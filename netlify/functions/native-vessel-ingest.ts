import type { Config } from "@netlify/functions";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { createDataBridgeVesselIngestion } from "../../db/data-bridge-ingestions.js";

type NativeIngestRequest = {
  fileName?: string;
  sourceFileName?: string;
  fileType?: string;
  sourceFileType?: string;
  fileContent?: string;
  sourceFileBase64?: string;
  sourceFileDataUrl?: string;
  text?: string;
};

type Vessel = {
  ship: string | null;
  imo: number | null;
  type: string | null;
  dwt: number | null;
  open_port: string | null;
  opening_dates: string | null;
  capacity: string | null;
  gear: string | null;
  rating: string | null;
  open_date: string | null;
  tc_index: string | null;
  offers: string | null;
  disp_owner: string | null;
  freight_cost: string | null;
  remarks: string | null;
  validation_status?: "INCOMPLETO";
};

type DataBridgeVessel = {
  nombre_buque: string;
  imo: string;
  tipo: string;
  dwt: number | null;
  puerto_apertura: string;
  fechas_apertura: string;
};

const FIELD_NAMES = [
  "ship",
  "imo",
  "type",
  "dwt",
  "open_port",
  "opening_dates",
  "capacity",
  "gear",
  "rating",
  "open_date",
  "tc_index",
  "offers",
  "disp_owner",
  "freight_cost",
  "remarks",
] as const;

const HEADER_ALIASES: Record<string, keyof Vessel> = {
  vessel: "ship",
  vesselname: "ship",
  shipname: "ship",
  buque: "ship",
  nombrebuque: "ship",
  ship: "ship",
  name: "ship",
  imo: "imo",
  imonumber: "imo",
  type: "type",
  vesseltype: "type",
  typebypurpose: "type",
  tipobuque: "type",
  dwt: "dwt",
  deadweight: "dwt",
  deadweightmt: "dwt",
  pesomuerto: "dwt",
  capacity: "capacity",
  gear: "gear",
  gears: "gear",
  rating: "rating",
  open: "open_port",
  openingport: "open_port",
  puertoapertura: "open_port",
  date: "opening_dates",
  dates: "opening_dates",
  openingdate: "opening_dates",
  openingdates: "opening_dates",
  fechasapertura: "opening_dates",
  opendate: "open_date",
  dateopen: "open_date",
  tcindex: "tc_index",
  tci: "tc_index",
  offers: "offers",
  offer: "offers",
  dispowner: "disp_owner",
  disponentowner: "disp_owner",
  owner: "disp_owner",
  freightcost: "freight_cost",
  freight: "freight_cost",
  remarks: "remarks",
  comment: "remarks",
  comments: "remarks",
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: jsonHeaders });
}

function cleanHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanText(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || /^n\/?a$/i.test(text) || /^null$/i.test(text) || text === "-") return null;
  return text;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const compact = raw.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!compact) return null;
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  let normalized = compact;

  if (hasComma && hasDot) {
    const lastComma = compact.lastIndexOf(",");
    const lastDot = compact.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = compact.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
  } else if (hasComma) {
    const groups = compact.split(",");
    normalized = groups.length > 1 && groups.slice(1).every((group) => group.length === 3)
      ? groups.join("")
      : compact.replace(",", ".");
  } else if (hasDot) {
    const groups = compact.split(".");
    normalized = groups.length > 1 && groups.slice(1).every((group) => group.length === 3)
      ? groups.join("")
      : compact;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanInteger(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const numeric = Number.parseInt(digits, 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanRoundedInteger(value: unknown) {
  const numeric = cleanNumber(value);
  return Number.isFinite(numeric) ? Math.round(Number(numeric)) : null;
}

function cleanDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = cleanText(value);
  if (!text) return null;
  const iso = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const euro = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (euro) {
    const year = euro[3].length === 2 ? `20${euro[3]}` : euro[3];
    return `${year}-${euro[2].padStart(2, "0")}-${euro[1].padStart(2, "0")}`;
  }
  return text;
}

function readDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return { mimeType: "", base64: value };
  return {
    mimeType: match[1] || "",
    base64: match[2] ? match[3] : Buffer.from(decodeURIComponent(match[3]), "utf8").toString("base64"),
  };
}

function decodeUpload(input: NativeIngestRequest) {
  const dataUrl = input.sourceFileDataUrl ? readDataUrl(input.sourceFileDataUrl) : null;
  const base64 = input.sourceFileBase64 || input.fileContent || dataUrl?.base64 || "";
  return {
    fileName: input.sourceFileName || input.fileName || "documento",
    mimeType: input.sourceFileType || input.fileType || dataUrl?.mimeType || "",
    buffer: base64 ? Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64") : Buffer.alloc(0),
  };
}

function inferFileType(fileName: string, mimeType: string) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "";
  if (mimeType.includes("pdf") || extension === "pdf") return "PDF";
  if (mimeType.includes("spreadsheet") || ["xlsx", "xls"].includes(extension || "")) return "XLSX";
  if (mimeType.includes("wordprocessingml") || extension === "docx") return "DOCX";
  if (mimeType.includes("csv") || extension === "csv") return "CSV";
  if (mimeType.startsWith("text/") || ["txt", "md"].includes(extension || "")) return "TEXT";
  return "UNKNOWN";
}

function inferProvider(fileName: string, rawText: string) {
  const source = `${fileName}\n${rawText.slice(0, 1000)}`.toLowerCase();
  if (source.includes("shipnext")) return "Shipnext";
  if (source.includes("seacharter")) return "SeaCharter";
  return "IDENTIFICADO_AUTOMATICAMENTE";
}

async function extractTextFromPdf(buffer: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text || "";
  } finally {
    await parser.destroy();
  }
}

async function extractNative(input: NativeIngestRequest) {
  if (input.text?.trim()) {
    return { fileName: input.sourceFileName || input.fileName || "texto", fileType: "TEXT", rawText: input.text.trim(), rows: [] as unknown[][] };
  }

  const upload = decodeUpload(input);
  const fileType = inferFileType(upload.fileName, upload.mimeType);
  if (!upload.buffer.byteLength) throw new Error("Formato de archivo no reconocido");

  if (fileType === "PDF") {
    const rawText = (await extractTextFromPdf(upload.buffer)).trim();
    if (!rawText) throw new Error("Formato de archivo no reconocido");
    return { fileName: upload.fileName, fileType, rawText, rows: [] as unknown[][] };
  }

  if (fileType === "DOCX") {
    const result = await mammoth.extractRawText({ buffer: upload.buffer });
    const rawText = result.value.trim();
    if (!rawText) throw new Error("Formato de archivo no reconocido");
    return { fileName: upload.fileName, fileType, rawText, rows: [] as unknown[][] };
  }

  if (fileType === "XLSX" || fileType === "CSV") {
    const workbook = XLSX.read(upload.buffer, { type: "buffer", cellDates: false });
    const rows = workbook.SheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    });
    const rawText = rows.map((row) => row.map((cell) => String(cell ?? "").trim()).join("\t")).join("\n").trim();
    if (!rows.length || !rawText) throw new Error("Formato de archivo no reconocido");
    return { fileName: upload.fileName, fileType, rawText, rows };
  }

  throw new Error("Formato de archivo no reconocido");
}

function normalizeVessel(partial: Record<string, unknown>) {
  const vessel: Vessel = {
    ship: cleanText(partial.ship),
    imo: cleanInteger(partial.imo),
    type: cleanText(partial.type),
    dwt: cleanRoundedInteger(partial.dwt),
    open_port: cleanText(partial.open_port),
    opening_dates: cleanText(partial.opening_dates),
    capacity: cleanText(partial.capacity),
    gear: cleanText(partial.gear),
    rating: cleanText(partial.rating),
    open_date: cleanDate(partial.open_date),
    tc_index: cleanText(partial.tc_index),
    offers: cleanText(partial.offers),
    disp_owner: cleanText(partial.disp_owner),
    freight_cost: cleanText(partial.freight_cost),
    remarks: cleanText(partial.remarks),
  };
  if (!vessel.ship || !vessel.imo) vessel.validation_status = "INCOMPLETO";
  return vessel;
}

function formatDateRange(value: string | null) {
  return value?.replace(/\u00a0/g, " ").replace(/\s*-\s*/g, " - ") || "N/A";
}

function toDataBridgeVessel(vessel: Vessel): DataBridgeVessel {
  return {
    nombre_buque: vessel.ship || "N/A",
    imo: vessel.imo ? String(vessel.imo) : "N/A",
    tipo: vessel.type || "N/A",
    dwt: Number.isFinite(vessel.dwt) ? Math.trunc(Number(vessel.dwt)) : null,
    puerto_apertura: vessel.open_port || vessel.open_date || "N/A",
    fechas_apertura: formatDateRange(vessel.opening_dates),
  };
}

function toDataBridgePayload(nativeData: Awaited<ReturnType<typeof extractNative>>, vessels: Vessel[]) {
  return {
    origen_archivo: nativeData.fileName.replace(/\.[^.]+$/, "") || "N/A",
    fecha_extraccion: new Date().toISOString().slice(0, 10),
    buques_detectados: vessels.map(toDataBridgeVessel),
  };
}

function parseRows(rows: unknown[][]) {
  const vessels: Vessel[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index].map((cell) => cleanText(cell));
    const mapped = cells.map((cell) => HEADER_ALIASES[cleanHeader(cell)]);
    const mappedCount = mapped.filter(Boolean).length;
    if (mappedCount < 3) continue;

    for (let rowIndex = index + 1; rowIndex < rows.length; rowIndex += 1) {
      const sourceRow = rows[rowIndex];
      if (!sourceRow.some((cell) => cleanText(cell))) continue;
      const nextMappedCount = sourceRow.map((cell) => HEADER_ALIASES[cleanHeader(cell)]).filter(Boolean).length;
      if (nextMappedCount >= 3) break;

      const partial: Partial<Vessel> = {};
      mapped.forEach((field, cellIndex) => {
        if (field) partial[field] = sourceRow[cellIndex] as never;
      });
      const vessel = normalizeVessel(partial);
      if (vessel.ship || vessel.imo || vessel.dwt) vessels.push(vessel);
    }
    if (vessels.length) break;
  }
  return vessels;
}

function parseDelimitedText(rawText: string) {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const separator = rawText.includes("\t") ? "\t" : rawText.includes(";") ? ";" : ",";
  const rows = lines.map((line) => line.split(separator).map((cell) => cell.trim()));
  return parseRows(rows);
}

function parseTextBlocks(rawText: string) {
  const blocks = rawText.split(/\n(?=[A-Z0-9][A-Z0-9 .'-]{2,}\s+(?:IMO\s*)?\d{7}\b)/);
  const vessels = blocks.map((block) => {
    const imo = block.match(/\b(?:IMO\s*)?(\d{7})\b/i)?.[1] || null;
    const dwt = block.match(/\b([\d.,]+)\s*(?:DWT|MT DWT|TDW)\b/i)?.[1] || null;
    const firstLine = block.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    const ship = firstLine.replace(/\b(?:IMO\s*)?\d{7}\b.*$/i, "").trim() || null;
    if (!ship && !imo && !dwt) return null;
    return normalizeVessel({
      ship,
      imo,
      dwt,
      type: block.match(/\b(BULK|MPP|TANKER|CONTAINER|CEMENT CARRIER|GENERAL CARGO)\b/i)?.[1] || null,
      capacity: block.match(/\b([\d.,]+\s*m3)\b/i)?.[1] || null,
      gear: block.match(/\b(gearless|cranes?[^;\n]*|grabs?[^;\n]*)\b/i)?.[1] || null,
      remarks: block.replace(/\s+/g, " ").slice(0, 500),
    });
  }).filter((vessel): vessel is Vessel => Boolean(vessel));
  return vessels;
}

function parseVessels(nativeData: Awaited<ReturnType<typeof extractNative>>) {
  if (nativeData.rows.length) {
    const vessels = parseRows(nativeData.rows);
    if (vessels.length) return vessels;
  }
  const delimited = parseDelimitedText(nativeData.rawText);
  if (delimited.length) return delimited;
  return parseTextBlocks(nativeData.rawText);
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Metodo no permitido. Use POST." }, 405);

  let body: NativeIngestRequest;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "JSON de entrada invalido." }, 400);
  }

  try {
    const nativeData = await extractNative(body);
    const vessels = parseVessels(nativeData);
    if (!vessels.length) throw new Error("Formato de archivo no reconocido");
    const dataBridgeJson = toDataBridgePayload(nativeData, vessels);

    const payload = {
      file_type: nativeData.fileType,
      source_provider: inferProvider(nativeData.fileName, nativeData.rawText),
      audit_status: "PENDIENTE_AUDITORIA",
      totalVesselsDetected: vessels.length,
      vessels,
      data_bridge_json: dataBridgeJson,
    };

    let ingestionId: number | undefined;
    try {
      const record = await createDataBridgeVesselIngestion({
        sourceFileName: nativeData.fileName,
        sourceFileType: nativeData.fileType,
        sourceProvider: payload.source_provider,
        auditStatus: "PENDIENTE_AUDITORIA",
        vesselCount: vessels.length,
        payload,
        rawText: nativeData.rawText.slice(0, 200000),
        errorMessage: null,
      });
      ingestionId = record?.id;
    } catch (storageError) {
      console.warn("[NPL] Ingesta procesada sin persistencia de auditoria.", storageError instanceof Error ? storageError.message : "storage unavailable");
    }

    return json({ success: true, ingestionId, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Formato de archivo no reconocido";
    return json({
      success: false,
      error: "Formato de archivo no reconocido",
      detail: message === "Formato de archivo no reconocido" ? "Solicite la plantilla correcta para procesar la ingesta nativa." : message,
    }, 422);
  }
};

export const config: Config = {
  path: ["/api/native-vessel-ingest", "/api/npl-engine"],
};
