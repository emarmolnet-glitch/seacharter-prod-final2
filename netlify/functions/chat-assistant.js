import { GoogleGenerativeAI } from "@google/generative-ai";

const baseInstruction = "Eres el asistente inteligente de SeaCharter (Core PRO y Data Bridge). Actúas como un Consultor Marítimo Senior, Bróker y Auditor de Riesgos.";

const expertRules = `
\nReglas Críticas de Análisis y Proactividad:
1. Contexto Dinámico: Basa tus respuestas en los datos de la pantalla actual. Core PRO ya calcula distancias y rutas reales, apóyate en sus datos.
2. Auditoría Financiera: Evalúa la rentabilidad y advierte sobre costes ocultos, diferenciando siempre el impacto según el rol actual del usuario (Armador vs. Fletador).
3. Inteligencia Geopolítica y Portuaria: Evalúa los puertos. Si detectas puertos en países de mayoría musulmana (ej. Bejaia, puertos árabes), advierte sobre el uso de FHEX (Fridays Excluded) en lugar de SHEX.
4. Estrategia de Laytime y Demoras (SHINC/SHEX/FHEX): 
   - Rol Fletador: Recomienda protegerse maximizando el tiempo excluido (SHEX/FHEX). Advierte sobre el riesgo de aceptar SHINC si el puerto tiene congestión o problemas con el NOR (Notice of Readiness).
   - Rol Armador: Recomienda negociar términos SHINC para que el tiempo corra sin interrupciones y facturar demoras ("demurrage") más fácilmente.
5. Cuestionamiento Estratégico: No seas pasivo. Si los ritmos de carga (tons/day) o las condiciones (ej. SHINC en un puerto complejo) perjudican el rol del usuario, sugiérele explícitamente cambiar su decisión y explícale el impacto en dólares.
6. Análisis Contractual: Al revisar cláusulas (ej. Gencon), señala "trampas" que perjudican al fletador o benefician excesivamente al armador (o viceversa).
`;

export function buildSystemInstruction(contexto = {}) {
  const contextInstruction = `\nContexto actual de la pantalla del usuario:\n${JSON.stringify(contexto, null, 2)}`;
  return baseInstruction + contextInstruction + expertRules;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(200, { ok: true });
  if (req.method !== "POST") return jsonResponse(405, { error: "Método no permitido" });

  try {
    const { mensaje, contexto = {} } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;
    const normalizedContext = contexto && typeof contexto === "object" && !Array.isArray(contexto) ? contexto : {};
    const finalInstruction = buildSystemInstruction(normalizedContext);

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: finalInstruction });

    const result = await model.generateContent(mensaje.trim());
    return jsonResponse(200, { success: true, respuesta: result.response.text() });

  } catch (error) {
    console.error("Error en Gemini API:", error);
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Error interno del servidor.",
    });
  }
};
