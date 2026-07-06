import type { Config } from "@netlify/functions";
import OpenAI from "openai";

type AnyRecord = Record<string, unknown>;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const SYSTEM_INSTRUCTION = `Actúa como el motor comercial de Rodahmar Shipping SL. Tu función es analizar, calcular y preparar paquetes de datos para carga manual en SeaCharter Data Bridge. Queda estrictamente prohibido intentar acceder, modificar o actualizar la base de datos o el esquema (Prisma).

Modo de Operación: El componente debe procesar textos/imágenes mediante parsing, aplicar la lógica de cálculo Cost-Plus definida en esta instrucción y generar salidas en formato tabla e informe imprimible.

Integridad de Datos (Prohibición de Migraciones): El componente NO tiene permisos para interactuar con la base de datos, ejecutar migraciones de Prisma o modificar el esquema de datos del despliegue. Cualquier transferencia de datos hacia el Data Bridge debe ser mediante la generación de archivos o bloques JSON para carga manual.

Configuración de Salida: El resultado siempre debe presentar un Panel de decisión tabulado, un bloque de texto para impresión con advertencia de Uso Informativo y un bloque de código JSON para importación manual.

1. ANÁLISIS DE DATOS (Estricto):

Extrae de la captura o texto únicamente los datos presentes (Nombre del buque, DWT, Fechas, Puertos, Cantidad). No infieras datos ausentes.

Cálculo 'Cost-Plus' (Informativo):

Costo Armador Total: Suma OPEX diario, CAPEX, bunker de posicionamiento y gastos portuarios (incluyendo demoras).

Precio Interno Armador: Aplica un margen del 15% sobre el costo armador.

Flete Venta Fletador: Aplica un margen del 10% sobre el Precio Interno, ajustando con la fórmula: Precio_Fletador = Precio_Interno / (1 - 0.0375) para garantizar el 10% neto tras comisión del 3.75% PUS.

2. SALIDA DE DATOS Y EXPORTACIÓN:

Panel de Decisión (Pantalla): Muestra tabla: Buque | Coste Armador Total | Precio Int. Armador (+15%) | Flete Venta Fletador (10%).

Informe para Impresión: Genera un bloque de texto estructurado con cabecera profesional y la advertencia: 'ESTE DOCUMENTO ES SOLO A TÍTULO INFORMATIVO. LOS CÁLCULOS DEFINITIVOS DEBEN REALIZARSE EN LA CALCULADORA SEACHARTER'.

Paquete JSON (Para Carga Manual): Genera un bloque de código JSON con los datos extraídos y calculados listo para copiar/pegar en la función de importación manual de SeaCharter Data Bridge.

REGLA DE ORO (No Migraciones): Este motor NO debe realizar ninguna acción de base de datos ni interactuar con migraciones de Prisma. La transferencia de datos a tu sistema se hará única y exclusivamente mediante la carga manual del archivo/bloque JSON que proporciones.`;

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
  const chartererSaleFreight = ownerInternalPrice / (1 - 0.0375);
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
      vesselName: textValue(vessel.vesselName, vessel.name, vessel.buque),
      dwt: Math.round(numberValue(vessel.dwt, vessel.DWT)),
      dates: textValue(vessel.dates, vessel.fechas, vessel.laycan, parsed.dates, parsed.fechas, parsed.laycan),
      ports: textValue(vessel.ports, vessel.puertos, vessel.pol && vessel.pod ? `${vessel.pol} / ${vessel.pod}` : "", parsed.ports, parsed.puertos),
      quantity: numberValue(vessel.quantity, vessel.cantidad, vessel.cargoQuantity, parsed.quantity, parsed.cantidad, parsed.cargoQuantity),
      ownerCost: totalCost,
      ownerInternalPrice: cascade.ownerInternalPrice,
      chartererSaleFreight: cascade.chartererSaleFreight,
      costBreakdown: pickObject(vessel.costBreakdown),
    };
  }).filter((vessel) => vessel.vesselName);

  return {
    documentType: textValue(parsed.documentType, parsed.tipoDocumento, "Documento comercial"),
    summary: textValue(parsed.summary, parsed.resumen, "Análisis comercial local generado para carga manual."),
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
      text: `Extrae exclusivamente los datos presentes en el siguiente material. No infieras datos ausentes. Devuelve solo JSON con documentType, summary y vessels[]. Cada vessel debe incluir vesselName, dwt, dates, ports, quantity, totalCost y costBreakdown {opex, capex, bunkerPositioning, portExpenses, delayAllowance}. Si falta un dato textual, usa cadena vacía. Si falta un coste, usa 0 y explica la laguna en summary.\n\nDOCUMENTO:\n${text}`,
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
                  dwt: { type: "number" },
                  dates: { type: "string" },
                  ports: { type: "string" },
                  quantity: { type: "number" },
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
                required: ["vesselName", "dwt", "dates", "ports", "quantity", "totalCost", "costBreakdown"],
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

function buildPrintableReport(analysis: ReturnType<typeof normalizeAnalysis>) {
  const money = (value: number) => `USD ${value.toLocaleString("es-ES", { maximumFractionDigits: 2 })}`;
  const rows = analysis.vessels.map((vessel) =>
    `${vessel.vesselName} | ${money(vessel.ownerCost)} | ${money(vessel.ownerInternalPrice)} | ${money(vessel.chartererSaleFreight)}`,
  ).join("\n");
  return [
    "RODAHMAR SHIPPING SL - MOTOR COMERCIAL LOCAL",
    `Documento: ${analysis.documentType}`,
    `Fecha: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Datos extraídos estrictamente del material recibido:",
    ...analysis.vessels.map((vessel) => `- Buque: ${vessel.vesselName || "No presente"} | DWT: ${vessel.dwt || "No presente"} | Fechas: ${vessel.dates || "No presente"} | Puertos: ${vessel.ports || "No presente"} | Cantidad: ${vessel.quantity || "No presente"}`),
    "",
    "Panel de Decisión",
    "Buque | Coste Armador Total | Precio Int. Armador (+15%) | Flete Venta Fletador (10%)",
    rows || "Sin buques detectados.",
    "",
    "ESTE DOCUMENTO ES SOLO A TÍTULO INFORMATIVO. LOS CÁLCULOS DEFINITIVOS DEBEN REALIZARSE EN LA CALCULADORA SEACHARTER",
  ].join("\n");
}

function buildManualImportPackage(analysis: ReturnType<typeof normalizeAnalysis>, llmResult: unknown) {
  return {
    source: "Rodahmar Shipping SL commercial NLP local engine",
    preparedFor: "SeaCharter Data Bridge manual import",
    preparedAt: new Date().toISOString(),
    databaseAction: "none",
    prismaAction: "none",
    extractionPolicy: "strict_no_inference",
    systemInstruction: "Prompt Maestro Rodahmar Shipping SL - No Migraciones",
    extractedData: analysis.vessels.map((vessel) => ({
      vesselName: vessel.vesselName || null,
      dwt: vessel.dwt || null,
      dates: vessel.dates || null,
      ports: vessel.ports || null,
      quantity: vessel.quantity || null,
      ownerTotalCost: vessel.ownerCost || null,
      ownerInternalPricePlus15Percent: vessel.ownerInternalPrice || null,
      chartererSaleFreight: vessel.chartererSaleFreight || null,
      costBreakdown: vessel.costBreakdown,
    })),
    formulas: {
      ownerTotalCost: "daily_opex + capex + positioning_bunker + port_expenses_including_demurrage",
      ownerInternalPricePlus15Percent: "owner_total_cost * 1.15",
      chartererSaleFreight: "owner_internal_price_plus_15_percent / (1 - 0.0375)",
    },
    rawExtraction: llmResult,
  };
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
    const manualImportPackage = buildManualImportPackage(analysis, llmResult);

    return Response.json({
      success: true,
      systemInstruction: SYSTEM_INSTRUCTION,
      mode: "local_manual_import_only",
      analysis,
      printableReport: buildPrintableReport(analysis),
      manualImportPackage,
      manualImportJson: JSON.stringify(manualImportPackage, null, 2),
      persistedCount: 0,
      confirmation: "Paquete JSON preparado para carga manual en SeaCharter Data Bridge. No se ha interactuado con base de datos, Prisma ni migraciones.",
      safetyNotice: "Modo local informativo: el motor solo analiza, calcula y genera salida manual. No persiste ni sincroniza datos automáticamente.",
    }, { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo ejecutar el Motor Comercial Integrado.";
    return Response.json({ success: false, error: message }, { status: 500, headers: jsonHeaders });
  }
};

export const config: Config = {
  path: ["/api/commercial-nlp", "/.netlify/functions/commercial-nlp"],
};
