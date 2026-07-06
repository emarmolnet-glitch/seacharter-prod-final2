import type { Config } from "@netlify/functions";
import OpenAI from "openai";
import { db } from "../../db/index.js";
import { externalPriorityRecords } from "../../db/schema.js";

type AnyRecord = Record<string, unknown>;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const SYSTEM_INSTRUCTION = `"ROL: MOTOR COMERCIAL INTEGRADO - RODAHMAR SHIPPING SL"

1. ANÁLISIS COMERCIAL (Modo Informativo):

Al recibir texto o imagen, extrae datos de buques (Nombre, IMO, DWT) y carga (POL/POD, Cantidad, Laycan).

Cálculo 'Cost-Plus': Suma OPEX, CAPEX, bunker de posicionamiento y gastos portuarios (considerando demoras en puertos complejos).

Márgenes en Cascada:

Precio Interno Armador = Coste Total * 1.15.

Flete Venta Fletador = (Precio Interno / 0.9625) * 1.10. (Esto garantiza margen del 10% neto tras comisión 3.75% PUS).

2. SALIDA Y PERSISTENCIA:

Panel de Decisión (Pantalla): Muestra tabla: Buque | Coste Armador | Precio Int. Armador (+15%) | Flete Venta Fletador (10%).

Reporte Imprimible: Genera un bloque de texto formateado (Cabecera, tabla, desglose) con la advertencia: 'ESTE DOCUMENTO ES SOLO A TÍTULO INFORMATIVO. LOS CÁLCULOS DEFINITIVOS DEBEN REALIZARSE EN LA CALCULADORA SEACHARTER'.

Sincronización: Clasifica los buques como 'Registros Externos Prioritarios' e inyéctalos en la cola del Motor de Coincidencia. Confirma siempre con el mensaje: "Datos inyectados correctamente en el Motor de Coincidencia. Pendientes de envío a Data Bridge como parte del paquete consolidado."

REGLA DE ORO: Bajo ninguna circunstancia este motor debe realizar operaciones automáticas en la Calculadora. Su función es informar, tabular y persistir datos para que el usuario finalice el cálculo de forma manual.`;

function textValue(...values: unknown[]) {
  const found = values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return found === undefined || found === null ? "" : String(found).trim();
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(String(value ?? "").replace(/,/g, ""));
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function pickObject(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function calculateCascade(totalCost: number) {
  const ownerInternalPrice = totalCost * 1.15;
  const chartererSaleFreight = (ownerInternalPrice / 0.9625) * 1.10;
  return { ownerInternalPrice, chartererSaleFreight };
}

function normalizeAnalysis(raw: unknown) {
  const parsed = pickObject(raw);
  const sourceVessels = Array.isArray(parsed.vessels) ? parsed.vessels : [];
  const vessels = sourceVessels.map((item) => {
    const vessel = pickObject(item);
    const totalCost = numberValue(vessel.totalCost, vessel.ownerCost, vessel.costeTotal, vessel.costeArmador);
    const cascade = calculateCascade(totalCost);
    return {
      vesselName: textValue(vessel.vesselName, vessel.name, vessel.buque, "TBN"),
      imo: textValue(vessel.imo, vessel.IMO, vessel.imoNumber, "N/A"),
      openCountry: textValue(vessel.openCountry, vessel.open, vessel.openPais, "N/A"),
      dwt: Math.round(numberValue(vessel.dwt, vessel.DWT)),
      pol: textValue(vessel.pol, vessel.POL, parsed.pol, "N/A"),
      pod: textValue(vessel.pod, vessel.POD, parsed.pod, "N/A"),
      cargoQuantity: numberValue(vessel.cargoQuantity, vessel.quantity, vessel.cantidad, parsed.cargoQuantity),
      laycan: textValue(vessel.laycan, parsed.laycan, "N/A"),
      ownerCost: totalCost,
      ownerInternalPrice: cascade.ownerInternalPrice,
      chartererSaleFreight: cascade.chartererSaleFreight,
      costBreakdown: pickObject(vessel.costBreakdown),
    };
  }).filter((vessel) => vessel.vesselName && vessel.vesselName !== "TBN");

  return {
    documentType: textValue(parsed.documentType, parsed.tipoDocumento, "Documento comercial"),
    summary: textValue(parsed.summary, parsed.resumen, "Análisis comercial informativo generado."),
    vessels,
  };
}

async function extractWithOpenAI(payload: AnyRecord) {
  const openai = new OpenAI();
  const text = String(payload.text || "").slice(0, 45000);
  const file = pickObject(payload.file);
  const content: any[] = [
    {
      type: "input_text",
      text: `Extrae buques y cargas del siguiente material. Devuelve solo JSON con documentType, summary y vessels[]. Cada vessel debe incluir vesselName, imo, openCountry, dwt, pol, pod, cargoQuantity, laycan, totalCost y costBreakdown {opex, capex, bunkerPositioning, portExpenses, delayAllowance}. Si falta un coste, usa 0 y explica la laguna en summary.\n\nDOCUMENTO:\n${text}`,
    },
  ];

  if (textValue(file.base64) && /^image\//.test(textValue(file.type))) {
    content.push({
      type: "input_image",
      image_url: `data:${textValue(file.type)};base64,${textValue(file.base64)}`,
    });
  }

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "rodahmar_commercial_nlp",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            documentType: { type: "string" },
            summary: { type: "string" },
            vessels: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  vesselName: { type: "string" },
                  imo: { type: "string" },
                  openCountry: { type: "string" },
                  dwt: { type: "number" },
                  pol: { type: "string" },
                  pod: { type: "string" },
                  cargoQuantity: { type: "number" },
                  laycan: { type: "string" },
                  totalCost: { type: "number" },
                  costBreakdown: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      opex: { type: "number" },
                      capex: { type: "number" },
                      bunkerPositioning: { type: "number" },
                      portExpenses: { type: "number" },
                      delayAllowance: { type: "number" },
                    },
                    required: ["opex", "capex", "bunkerPositioning", "portExpenses", "delayAllowance"],
                  },
                },
                required: ["vesselName", "imo", "openCountry", "dwt", "pol", "pod", "cargoQuantity", "laycan", "totalCost", "costBreakdown"],
              },
            },
          },
          required: ["documentType", "summary", "vessels"],
        },
      },
    },
  });

  return JSON.parse(response.output_text || "{\"vessels\":[]}");
}

async function persistVessels(vessels: ReturnType<typeof normalizeAnalysis>["vessels"], rawPayload: unknown) {
  if (!vessels.length) return [];
  return db.insert(externalPriorityRecords).values(vessels.map((vessel) => ({
    source: "commercial_nlp",
    priority: 100,
    status: "pending_databridge",
    vesselName: vessel.vesselName,
    imo: vessel.imo,
    openCountry: vessel.openCountry,
    dwt: vessel.dwt,
    pol: vessel.pol,
    pod: vessel.pod,
    cargoQuantity: String(vessel.cargoQuantity),
    laycan: vessel.laycan,
    ownerCost: String(vessel.ownerCost),
    ownerInternalPrice: String(vessel.ownerInternalPrice),
    chartererSaleFreight: String(vessel.chartererSaleFreight),
    rawPayload: { ...vessel, sourcePayload: rawPayload },
  }))).returning();
}

function buildPrintableReport(analysis: ReturnType<typeof normalizeAnalysis>) {
  const money = (value: number) => `USD ${value.toLocaleString("es-ES", { maximumFractionDigits: 2 })}`;
  const rows = analysis.vessels.map((vessel) =>
    `${vessel.vesselName} | ${vessel.imo} | ${money(vessel.ownerCost)} | ${money(vessel.ownerInternalPrice)} | ${money(vessel.chartererSaleFreight)}`,
  ).join("\n");
  return [
    "RODAHMAR SHIPPING SL - MOTOR COMERCIAL INTEGRADO",
    `Documento: ${analysis.documentType}`,
    `Fecha: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Buque | IMO | Coste Armador | Precio Int. Armador (+15%) | Flete Venta Fletador (10%)",
    rows || "Sin buques detectados.",
    "",
    "ESTE DOCUMENTO ES SOLO A TÍTULO INFORMATIVO. LOS CÁLCULOS DEFINITIVOS DEBEN REALIZARSE EN LA CALCULADORA SEACHARTER",
  ].join("\n");
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return Response.json({ success: false, error: "Payload JSON inválido." }, { status: 400, headers: jsonHeaders });
  }

  try {
    const llmResult = await extractWithOpenAI(payload as AnyRecord);
    const analysis = normalizeAnalysis(llmResult);
    const inserted = await persistVessels(analysis.vessels, llmResult);

    return Response.json({
      success: true,
      systemInstruction: SYSTEM_INSTRUCTION,
      mode: "informativo",
      analysis,
      printableReport: buildPrintableReport(analysis),
      persistedCount: inserted.length,
      confirmation: "Datos inyectados correctamente en el Motor de Coincidencia. Pendientes de envío a Data Bridge como parte del paquete consolidado.",
      safetyNotice: "Modo informativo: el motor no modifica ni ejecuta operaciones automáticas en la Calculadora SeaCharter.",
    }, { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo ejecutar el Motor Comercial Integrado.";
    return Response.json({ success: false, error: message }, { status: 500, headers: jsonHeaders });
  }
};

export const config: Config = {
  path: ["/api/commercial-nlp", "/.netlify/functions/commercial-nlp"],
};
