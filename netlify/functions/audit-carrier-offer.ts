import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import OpenAI from "openai";

type ChargeLevel = "PerEquipment" | "PerBillOfLading" | "PerTon" | "PerContainer";
type ChargeCategory = "Ocean Freight" | "FOB/Local" | "Origin" | "Destination" | "Insurance" | "Other";
type Incoterm = "EXW" | "FCA" | "FAS" | "FOB" | "CFR" | "CIF" | "CPT" | "CIP" | "DAP" | "DPU" | "DDP";

type ExtractedSurcharge = {
  concept: string;
  amount: number;
  currency: string;
  chargeLevel: ChargeLevel;
  containerType?: string;
  category?: ChargeCategory;
  isExcludedByIncoterm?: boolean;
  exclusionReason?: string;
};

type ExtractedOffer = {
  detectedCarrierName: string;
  detectedQuoteReference: string;
  detectedIncoterm: Incoterm | "";
  lines: ReturnType<typeof normalizeLines>;
};

type SelectedEquipment = {
  containerType?: string;
  type?: string;
  quantity?: number;
};

type AuditRequest = {
  action?: "extract" | "save";
  carrierName?: string;
  quoteReference?: string;
  mode?: "FCL" | "LCL";
  portOfLoading?: string;
  portOfDischarge?: string;
  sourceFileName?: string;
  documentText?: string;
  sourceFileBase64?: string;
  sourceFileType?: string;
  sourceFileDataUrl?: string;
  markupPercentage?: number;
  markupFixedFee?: number;
  selectedEquipment?: SelectedEquipment[];
  incoterm?: Incoterm | "";
  lines?: ExtractedSurcharge[];
};

const allowedChargeLevels = new Set(["PerEquipment", "PerBillOfLading", "PerTon", "PerContainer"]);

function normalizeCurrency(currency: string | undefined) {
  const normalized = String(currency || "USD").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

function normalizeChargeLevel(value: string | undefined): ChargeLevel {
  return allowedChargeLevels.has(String(value)) ? value as ChargeLevel : "PerContainer";
}

const incoterms: Incoterm[] = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

function normalizeIncoterm(value: string | undefined): Incoterm | "" {
  const normalized = String(value || "").trim().toUpperCase();
  return incoterms.includes(normalized as Incoterm) ? normalized as Incoterm : "";
}

function classifyCharge(concept: string, explicitCategory?: string): ChargeCategory {
  if (explicitCategory === "Ocean Freight" || explicitCategory === "FOB/Local" || explicitCategory === "Origin" || explicitCategory === "Destination" || explicitCategory === "Insurance" || explicitCategory === "Other") {
    return explicitCategory;
  }

  const normalized = concept.toLowerCase();
  if (normalized.includes("ocean") || normalized.includes("freight") || normalized === "ofr") return "Ocean Freight";
  if (normalized.includes("insurance") || normalized.includes("seguro")) return "Insurance";
  if (normalized.includes("destination") || normalized.includes("destino") || normalized.includes("delivery") || normalized.includes("import")) return "Destination";
  if (normalized.includes("origin") || normalized.includes("origen") || normalized.includes("export") || normalized.includes("fob") || normalized.includes("custom")) return "Origin";
  if (normalized.includes("thc") || normalized.includes("local")) return "FOB/Local";
  return "Other";
}

function incotermExclusion(category: ChargeCategory, incoterm: Incoterm | "") {
  if (!incoterm) return "";
  const excludesOrigin = ["FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"].includes(incoterm);
  const includesDestination = ["DAP", "DPU", "DDP"].includes(incoterm);
  const includesInsurance = ["CIF", "CIP"].includes(incoterm);

  if ((category === "Origin" || category === "FOB/Local") && excludesOrigin) return `Excluido por Incoterm ${incoterm}: origen no repercute al comprador.`;
  if (category === "Destination" && !includesDestination) return `Excluido por Incoterm ${incoterm}: destino no está incluido.`;
  if (category === "Insurance" && !includesInsurance) return `Excluido por Incoterm ${incoterm}: seguro no está incluido.`;
  return "";
}

function normalizeContainerType(value: string | undefined) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/['"\s_-]/g, "");

  if (["20", "20ST", "20STD", "20STANDARD", "20DV"].includes(normalized)) return "20ST";
  if (["40", "40ST", "40STD", "40STANDARD", "40DV"].includes(normalized)) return "40ST";
  if (["40HC", "40HQ", "40HIGHCUBE"].includes(normalized)) return "40HC";
  if (["REEFER", "RF", "40RF", "40REEFER", "20RF"].includes(normalized)) return "REEFER";
  if (["FLATRACK", "20FLATRACK", "FR", "20FR"].includes(normalized)) return "FLAT_RACK";
  if (["OPENTOP", "20OPENTOP", "OT", "20OT"].includes(normalized)) return "OPEN_TOP";
  return normalized;
}

function extractContainerTypeFromConcept(concept: string) {
  const normalized = concept.toUpperCase().replace(/['"\s_-]/g, "");
  if (normalized.includes("40HC") || normalized.includes("40HQ") || normalized.includes("40HIGHCUBE")) return "40HC";
  if (normalized.includes("40STD") || normalized.includes("40DV") || normalized.includes("40STANDARD")) return "40ST";
  if (normalized.includes("20STD") || normalized.includes("20DV") || normalized.includes("20STANDARD")) return "20ST";
  if (normalized.includes("REEFER") || normalized.includes("40RF") || normalized.includes("20RF")) return "REEFER";
  if (normalized.includes("FLATRACK")) return "FLAT_RACK";
  if (normalized.includes("OPENTOP")) return "OPEN_TOP";
  return "";
}

function formatContainerType(containerType: string) {
  const labels: Record<string, string> = {
    "20ST": "20'STD",
    "40ST": "40'STD",
    "40HC": "40'HC",
    REEFER: "Reefer",
    FLAT_RACK: "Flat Rack",
    OPEN_TOP: "Open Top",
  };

  return labels[containerType] || containerType;
}

function normalizeLines(lines: ExtractedSurcharge[] | undefined, incoterm: Incoterm | "") {
  return (lines || [])
    .map((line) => {
      const amount = Number(line.amount);
      const concept = String(line.concept || "").trim();
      if (!concept || !Number.isFinite(amount)) return null;

      const category = classifyCharge(concept, line.category);
      return {
        concept,
        amount,
        currency: normalizeCurrency(line.currency),
        chargeLevel: normalizeChargeLevel(line.chargeLevel),
        containerType: normalizeContainerType(line.containerType) || extractContainerTypeFromConcept(concept),
        category,
        isExcludedByIncoterm: Boolean(incotermExclusion(category, incoterm)),
        exclusionReason: incotermExclusion(category, incoterm),
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
}

function includedLines(lines: ReturnType<typeof applyMargins>) {
  return lines.filter((line) => !line.isExcludedByIncoterm);
}

function calculateTotalQuote(selectedEquipment: SelectedEquipment[] | undefined, lines: ReturnType<typeof applyMargins>) {
  const activeLines = includedLines(lines);
  const equipmentList = (selectedEquipment || [])
    .map((item) => ({
      containerType: normalizeContainerType(item.containerType || item.type),
      quantity: Math.max(0, Number(item.quantity) || 0),
    }))
    .filter((item) => item.containerType && item.quantity > 0);
  const currency = lines[0]?.currency || "USD";
  const breakdownLines = equipmentList.map((equipment) => {
    const unitAmount = activeLines
      .filter((line) => (line.chargeLevel === "PerEquipment" || line.chargeLevel === "PerContainer") && line.containerType === equipment.containerType)
      .reduce((sum, line) => sum + line.proposedSellAmount, 0);
    const totalAmount = Math.round(unitAmount * equipment.quantity * 100) / 100;
    return {
      label: `Flete para ${equipment.quantity}x ${formatContainerType(equipment.containerType)} = ${totalAmount.toFixed(2)} ${currency}`,
      containerType: equipment.containerType,
      quantity: equipment.quantity,
      unitAmount: Math.round(unitAmount * 100) / 100,
      totalAmount,
      currency,
      isGeneralCharge: false,
    };
  });
  const generalTotal = Math.round(activeLines
    .filter((line) => line.chargeLevel === "PerBillOfLading")
    .reduce((sum, line) => sum + line.proposedSellAmount, 0) * 100) / 100;

  if (generalTotal > 0) {
    breakdownLines.push({
      label: `Gastos generales (BL Fee) = ${generalTotal.toFixed(2)} ${currency}`,
      containerType: "",
      quantity: 1,
      unitAmount: generalTotal,
      totalAmount: generalTotal,
      currency,
      isGeneralCharge: true,
    });
  }

  return {
    totalAmount: Math.round(breakdownLines.reduce((sum, line) => sum + line.totalAmount, 0) * 100) / 100,
    currency,
    lines: breakdownLines,
  };
}

function applyMargins(lines: ReturnType<typeof normalizeLines>, markupPercentage: number, markupFixedFee: number) {
  return lines.map((line) => {
    const marginApplied = line.category === "Ocean Freight"
      ? line.amount * markupPercentage / 100
      : line.category === "FOB/Local"
        ? markupFixedFee
        : 0;

    return {
      ...line,
      proposedSellAmount: Math.round((line.amount + marginApplied) * 100) / 100,
      marginApplied: Math.round(marginApplied * 100) / 100,
    };
  });
}

function currencySummary(lines: ReturnType<typeof applyMargins>) {
  return includedLines(lines).reduce<Record<string, { carrierCost: number; proposedSell: number }>>((summary, line) => {
    summary[line.currency] ||= { carrierCost: 0, proposedSell: 0 };
    summary[line.currency].carrierCost += line.amount;
    summary[line.currency].proposedSell += line.proposedSellAmount;
    return summary;
  }, {});
}

function createAuditId() {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `carrier-audit-${Date.now()}-${randomSuffix}`;
}

function cleanFileName(value: string | undefined) {
  return String(value || "carrier-offer")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "carrier-offer";
}

function normalizeBase64(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.includes(",") ? raw.split(",").pop() || "" : raw;
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function mimeFromPayload(payload: AuditRequest) {
  const explicit = String(payload.sourceFileType || "").trim();
  if (explicit) return explicit;
  const dataUrl = String(payload.sourceFileDataUrl || "");
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  return match?.[1] || "application/octet-stream";
}

async function persistSourceFile(payload: AuditRequest, auditId: string) {
  const base64 = normalizeBase64(payload.sourceFileBase64 || payload.sourceFileDataUrl);
  if (!base64) return "";

  const bytes = base64ToArrayBuffer(base64);
  if (!bytes.byteLength) return "";

  const store = getStore("carrier-rate-audit-files");
  const key = `${auditId}/${cleanFileName(payload.sourceFileName)}`;
  await store.set(key, bytes);
  return key;
}

async function saveCarrierRateAudit(payload: AuditRequest, lines: ReturnType<typeof applyMargins>, markupPercentage: number, markupFixedFee: number) {
  const auditId = createAuditId();
  const createdAt = new Date().toISOString();
  const summary = currencySummary(lines);
  const sourceFileBlobKey = await persistSourceFile(payload, auditId);
  const auditDocument = {
    id: auditId,
    carrierName: payload.carrierName || "Naviera sin identificar",
    quoteReference: payload.quoteReference || null,
    mode: payload.mode || "FCL",
    portOfLoading: payload.portOfLoading || null,
    portOfDischarge: payload.portOfDischarge || null,
    sourceFileName: payload.sourceFileName || "oferta",
    sourceFileBlobKey,
    markupPercentage,
    markupFixedFee,
    incoterm: normalizeIncoterm(payload.incoterm),
    currencySummary: summary,
    lines,
    quoteBreakdown: calculateTotalQuote(payload.selectedEquipment, lines),
    createdAt,
  };

  const store = getStore("carrier-rate-audits");
  await store.setJSON(`${auditId}.json`, auditDocument);

  return { auditId, summary };
}

async function extractWithLlm(payload: AuditRequest) {
  const documentText = String(payload.documentText || "").slice(0, 45000);
  const fileType = mimeFromPayload(payload);
  const dataUrl = String(payload.sourceFileDataUrl || "").startsWith("data:")
    ? String(payload.sourceFileDataUrl)
    : normalizeBase64(payload.sourceFileBase64)
      ? `data:${fileType};base64,${normalizeBase64(payload.sourceFileBase64)}`
      : "";
  const canUseVision = dataUrl && fileType.startsWith("image/");
  const canUseFile = dataUrl && [
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ].includes(fileType);

  if (!documentText.trim() && !canUseVision && !canUseFile) {
    return { detectedCarrierName: "", detectedQuoteReference: "", detectedIncoterm: "", lines: [] } satisfies ExtractedOffer;
  }

  const openai = new OpenAI();
  const userContent = canUseVision
    ? [
        {
          type: "input_text" as const,
          text: `Oferta de naviera (${payload.sourceFileName || "sin nombre"}). Extrae datos desde la imagen y desde cualquier texto OCR adjunto:\n\n${documentText}`,
        },
        {
          type: "input_image" as const,
          image_url: dataUrl,
          detail: "high" as const,
        },
      ]
    : canUseFile
      ? [
          {
            type: "input_text" as const,
            text: `Oferta de naviera (${payload.sourceFileName || "sin nombre"}). Extrae datos desde el archivo adjunto y desde cualquier texto OCR disponible:\n\n${documentText}`,
          },
          {
            type: "input_file" as const,
            file_data: dataUrl,
            filename: cleanFileName(payload.sourceFileName),
          },
        ]
    : `Oferta de naviera (${payload.sourceFileName || "sin nombre"}):\n\n${documentText}`;

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      {
        role: "system",
        content: "Eres SmartDocumentParser para ofertas FCL/LCL de navieras. Devuelve solo JSON valido con carrierName, quoteReference, incoterm y surcharges. Extrae la naviera, la referencia/cotizacion/oferta, Concepto, Importe, Moneda, Nivel de Carga e Incoterm si aparecen. Usa PerEquipment, PerBillOfLading, PerTon o PerContainer. Clasifica category como Ocean Freight, Origin, Destination, Insurance, FOB/Local u Other. Si no detectas naviera o referencia, devuelve string vacio.",
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "carrier_offer_surcharges",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            carrierName: { type: "string" },
            quoteReference: { type: "string" },
            surcharges: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  concept: { type: "string" },
                  amount: { type: "number" },
                  currency: { type: "string" },
                  chargeLevel: { type: "string", enum: ["PerEquipment", "PerBillOfLading", "PerTon", "PerContainer"] },
                  containerType: { type: "string" },
                  category: { type: "string", enum: ["Ocean Freight", "Origin", "Destination", "Insurance", "FOB/Local", "Other"] },
                },
                required: ["concept", "amount", "currency", "chargeLevel", "containerType", "category"],
              },
            },
            incoterm: { type: "string", enum: ["", "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] },
          },
          required: ["carrierName", "quoteReference", "incoterm", "surcharges"],
        },
      },
    },
  });

  let parsed: {
    carrierName?: string;
    quoteReference?: string;
    incoterm?: string;
    surcharges?: ExtractedSurcharge[];
  };

  try {
    parsed = JSON.parse(response.output_text || "{\"surcharges\":[]}");
  } catch {
    throw new Error("La IA no devolvió un JSON válido para la oferta. Reintenta con un documento más legible o con OCR.");
  }

  const detectedIncoterm = normalizeIncoterm(parsed.incoterm);
  return {
    detectedCarrierName: String(parsed.carrierName || "").trim(),
    detectedQuoteReference: String(parsed.quoteReference || "").trim(),
    detectedIncoterm,
    lines: normalizeLines(parsed.surcharges, detectedIncoterm || normalizeIncoterm(payload.incoterm)),
  } satisfies ExtractedOffer;
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const payload = await req.json() as AuditRequest;
    const markupPercentage = Number.isFinite(Number(payload.markupPercentage)) ? Number(payload.markupPercentage) : 8;
    const markupFixedFee = Number.isFinite(Number(payload.markupFixedFee)) ? Number(payload.markupFixedFee) : 75;
    const incoterm = normalizeIncoterm(payload.incoterm);

    if (payload.action === "save") {
      const lines = applyMargins(normalizeLines(payload.lines, incoterm), markupPercentage, markupFixedFee);
      if (!lines.length) {
        return Response.json({ success: false, error: "No hay costes normalizados para guardar." }, { status: 400 });
      }

      const savedAudit = await saveCarrierRateAudit(payload, lines, markupPercentage, markupFixedFee);
      return Response.json({ success: true, auditId: savedAudit.auditId, lines, summary: savedAudit.summary, quoteBreakdown: calculateTotalQuote(payload.selectedEquipment, lines) }, { status: 201 });
    }

    const extracted = await extractWithLlm(payload);
    const detectedIncoterm = extracted.detectedIncoterm || incoterm;
    const lines = applyMargins(normalizeLines(extracted.lines, detectedIncoterm), markupPercentage, markupFixedFee);
    return Response.json({
      success: true,
      detectedCarrierName: extracted.detectedCarrierName,
      detectedQuoteReference: extracted.detectedQuoteReference,
      detectedIncoterm,
      lines,
      summary: currencySummary(lines),
      quoteBreakdown: calculateTotalQuote(payload.selectedEquipment, lines)
    });
  } catch (error) {
    console.error("[audit-carrier-offer] Request failed.", error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "No se pudo auditar la oferta con IA.",
    }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/audit-carrier-offer",
};
