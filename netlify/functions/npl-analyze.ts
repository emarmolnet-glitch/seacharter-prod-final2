import type { Config } from "@netlify/functions";
import OpenAI from "openai";

type NplRequest = {
  text?: string;
  sourceFileName?: string;
  sourceFileType?: string;
  sourceFileBase64?: string;
  sourceFileDataUrl?: string;
  origenDatos?: "Core PRO" | "Externo";
};

type TechnicalVessel = {
  vesselName: string;
  imo: string;
  dwt: number;
  vesselType: string;
  flag: string;
  flagAlpha2: string;
  yearBuilt: number;
  hasGears: boolean;
  lastPort: string;
  ownerManager: string;
  draftMeters: number;
  eta: string;
  specifications: Array<{ field: string; value: string }>;
};

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function parseNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const compact = raw.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  const commaCount = (compact.match(/,/g) || []).length;
  const dotCount = (compact.match(/\./g) || []).length;
  let normalized = compact;
  if (commaCount && dotCount) {
    const decimalSeparator = compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = compact.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
  } else if (commaCount || dotCount) {
    const separator = commaCount ? "," : ".";
    const groups = compact.split(separator);
    normalized = groups.length > 1 && groups.slice(1).every((group) => /^\d{3}$/.test(group))
      ? groups.join("")
      : compact.replace(separator, ".");
  }
  const numeric = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function readDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return { contentType: "", base64: dataUrl };
  return {
    contentType: match[1] || "",
    base64: match[2] ? match[3] : Buffer.from(decodeURIComponent(match[3]), "utf8").toString("base64"),
  };
}

function buildDataUrl(body: NplRequest) {
  if (String(body.sourceFileDataUrl || "").startsWith("data:")) return String(body.sourceFileDataUrl);
  if (!body.sourceFileBase64) return "";
  return `data:${body.sourceFileType || "image/jpeg"};base64,${body.sourceFileBase64}`;
}

function decodeTextFile(base64: string) {
  try {
    return Buffer.from(base64, "base64").toString("utf8").replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

function extractPlainText(input: NplRequest) {
  if (input.text?.trim()) return input.text.trim();
  const dataUrl = input.sourceFileDataUrl ? readDataUrl(input.sourceFileDataUrl) : null;
  const contentType = input.sourceFileType || dataUrl?.contentType || "";
  const base64 = input.sourceFileBase64 || dataUrl?.base64 || "";
  const extension = String(input.sourceFileName || "").split(".").pop()?.toLowerCase() || "";
  if (base64 && (contentType.startsWith("text/") || ["txt", "csv", "md"].includes(extension))) {
    return decodeTextFile(base64);
  }
  return "";
}

function extractFallback(text: string): TechnicalVessel {
  const find = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return "";
  };
  const flag = find([/(?:flag|bandera)\s*[:\-]\s*([^\n,;]+)/i]);
  return {
    vesselName: find([/(?:vessel\s*name|ship\s*name|nombre\s+del\s+buque|buque|vessel|ship|m\/?v)\s*[:\-]\s*([^\n,;]+)/i]),
    imo: find([/\bimo\s*(?:no\.?|number|n[uú]mero)?\s*[:\-]?\s*(\d{7})\b/i]),
    dwt: parseNumber(find([/(?:dwt|deadweight)\s*[:\-]?\s*([\d.,]+)/i, /([\d.,]+)\s*(?:dwt|mt\s+dwt)\b/i])),
    vesselType: find([/(?:vessel\s*type|ship\s*type|tipo\s+de\s+buque|tipo\s+buque)\s*[:\-]\s*([^\n,;]+)/i]),
    flag,
    flagAlpha2: countryAlpha2(flag),
    yearBuilt: parseNumber(find([/(?:year\s*built|built|a[nñ]o\s+de\s+construcci[oó]n|a[nñ]o)\s*[:\-]?\s*((?:19|20)\d{2})/i])),
    hasGears: /\b(?:geared|gr[uú]as?)\b/i.test(text),
    lastPort: "",
    ownerManager: "",
    draftMeters: 0,
    eta: "",
    specifications: [],
  };
}

function countryAlpha2(country: string) {
  const normalized = country.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const codes: Record<string, string> = {
    antigua: "AG", "antigua and barbuda": "AG", bahamas: "BS", barbados: "BB", belize: "BZ",
    bermuda: "BM", china: "CN", chipre: "CY", cyprus: "CY", dinamarca: "DK", denmark: "DK",
    espana: "ES", spain: "ES", grecia: "GR", greece: "GR", hongkong: "HK", "hong kong": "HK",
    india: "IN", indonesia: "ID", "islas caiman": "KY", "cayman islands": "KY", japon: "JP", japan: "JP",
    liberia: "LR", malta: "MT", "marshall islands": "MH", "islas marshall": "MH", noruega: "NO", norway: "NO",
    panama: "PA", portugal: "PT", singapur: "SG", singapore: "SG", turquia: "TR", turkey: "TR",
    "reino unido": "GB", "united kingdom": "GB", vanuatu: "VU", vietnam: "VN", "viet nam": "VN",
  };
  return codes[normalized] || (/^[a-z]{2}$/.test(normalized) ? normalized.toUpperCase() : "");
}

function normalizeVessel(value: any, fallback: TechnicalVessel): TechnicalVessel {
  const vessel = value?.vessel || value?.buque || value || {};
  const imo = String(vessel.imo ?? fallback.imo ?? "").replace(/\D/g, "").slice(0, 7);
  return {
    vesselName: String(vessel.vesselName ?? vessel.vessel_name ?? vessel.nombre_buque ?? fallback.vesselName ?? "").trim(),
    imo: /^\d{7}$/.test(imo) ? imo : "",
    dwt: parseNumber(vessel.dwt ?? fallback.dwt),
    vesselType: String(vessel.vesselType ?? vessel.vessel_type ?? vessel.tipo_buque ?? fallback.vesselType ?? "").trim(),
    flag: String(vessel.flag ?? vessel.bandera ?? fallback.flag ?? "").trim(),
    flagAlpha2: String(vessel.flagAlpha2 ?? vessel.flag_alpha2 ?? fallback.flagAlpha2 ?? "").trim().toUpperCase().slice(0, 2)
      || countryAlpha2(String(vessel.flag ?? vessel.bandera ?? fallback.flag ?? "")),
    yearBuilt: Math.trunc(parseNumber(vessel.yearBuilt ?? vessel.year_built ?? vessel.ano_construccion ?? fallback.yearBuilt)),
    hasGears: Boolean(vessel.hasGears ?? vessel.has_gears ?? fallback.hasGears),
    lastPort: String(vessel.lastPort ?? vessel.last_port ?? "").trim(),
    ownerManager: String(vessel.ownerManager ?? vessel.owner_manager ?? "").trim(),
    draftMeters: parseNumber(vessel.draftMeters ?? vessel.draft_meters),
    eta: String(vessel.eta ?? "").trim(),
    specifications: Array.isArray(vessel.specifications)
      ? vessel.specifications
          .map((item: any) => ({ field: String(item?.field || "").trim(), value: String(item?.value || "").trim() }))
          .filter((item: { field: string; value: string }) => item.field && item.value)
      : [],
  };
}

async function extractTechnicalVessel(body: NplRequest, text: string) {
  const dataUrl = buildDataUrl(body);
  const canUseVision = Boolean(dataUrl && String(body.sourceFileType || "").startsWith("image/"));
  const fallback = extractFallback(text);
  const openai = new OpenAI();
  const userContent = canUseVision
    ? [
        { type: "input_text" as const, text: `Lee la ficha o captura marítima y extrae todos los datos técnicos visibles del buque. No inventes valores. Texto adicional:\n${text}` },
        { type: "input_image" as const, image_url: dataUrl, detail: "high" as const },
      ]
    : `Extrae todos los datos técnicos visibles del buque sin inventar valores:\n${text}`;

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      {
        role: "system",
        content: "Eres un extractor técnico marítimo para SeaCharter Core PRO. Devuelve exclusivamente JSON. Prioriza nombre del buque, IMO, DWT, tipo, bandera, código de país ISO 3166-1 Alfa-2 de la bandera y año de construcción. flag debe contener el país y flagAlpha2 sus dos letras en mayúsculas. Conserva cualquier otra especificación visible dentro de specifications. Usa string vacío o 0 si un dato no aparece.",
      },
      { role: "user", content: userContent },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "technical_vessel",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["vesselName", "imo", "dwt", "vesselType", "flag", "flagAlpha2", "yearBuilt", "hasGears", "lastPort", "ownerManager", "draftMeters", "eta", "specifications"],
          properties: {
            vesselName: { type: "string" },
            imo: { type: "string" },
            dwt: { type: "number" },
            vesselType: { type: "string" },
            flag: { type: "string" },
            flagAlpha2: { type: "string" },
            yearBuilt: { type: "number" },
            hasGears: { type: "boolean" },
            lastPort: { type: "string" },
            ownerManager: { type: "string" },
            draftMeters: { type: "number" },
            eta: { type: "string" },
            specifications: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["field", "value"],
                properties: {
                  field: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  });

  return normalizeVessel(JSON.parse(response.output_text || "{}"), fallback);
}

export default async (req: Request) => {
  if (req.method !== "POST") return responseJson({ error: "Metodo no permitido. Use POST." }, 405);

  let body: NplRequest;
  try {
    body = await req.json();
  } catch {
    return responseJson({ error: "JSON de entrada invalido." }, 400);
  }

  const text = extractPlainText(body);
  const dataUrl = buildDataUrl(body);
  if (!text && !dataUrl) return responseJson({ error: "No hay texto ni imagen procesable para analizar." }, 400);

  let vessel: TechnicalVessel;
  try {
    vessel = await extractTechnicalVessel(body, text);
  } catch (error) {
    vessel = extractFallback(text);
    if (!vessel.vesselName && !vessel.imo) {
      return responseJson({ error: "No se pudieron extraer datos técnicos de la imagen o texto." }, 422);
    }
  }

  const origenDatos = body.origenDatos === "Core PRO" ? "Core PRO" : "Externo";
  const detectedAt = new Date().toISOString();
  const bridgeVessel = {
    imo: vessel.imo ? Number(vessel.imo) : 0,
    is_audit_required: false,
    vessel_name: vessel.vesselName || "N/A",
    dwt: Math.trunc(vessel.dwt || 0),
    has_gears: vessel.hasGears,
    flag: vessel.flag || "N/A",
    flag_alpha2: vessel.flagAlpha2 || "N/A",
    last_port: vessel.lastPort || "N/A",
    vessel_type: vessel.vesselType || "N/A",
    year_built: vessel.yearBuilt || 0,
    owner_manager: vessel.ownerManager || "N/A",
    draft_meters: vessel.draftMeters || 0,
    eta: vessel.eta || "N/A",
    detected_at: detectedAt,
    origen_datos: origenDatos,
    specifications: vessel.specifications,
  };
  const manualImportPackage = {
    format: "seacharter.npl.external.v1",
    source: "core-pro-npl-direct",
    created_at: detectedAt,
    origen_datos: origenDatos,
    vessels: [bridgeVessel],
  };

  return responseJson({
    success: true,
    analysis: {
      documentType: "Ficha técnica marítima",
      summary: "Datos técnicos extraídos de la imagen o texto recibido.",
      vessels: [vessel],
    },
    manualImportPackage,
    manualImportJson: JSON.stringify(manualImportPackage, null, 2),
    persistedCount: 0,
  });
};

export const config: Config = {
  path: ["/api/npl-analyze", "/api/npl/analyze"],
};
