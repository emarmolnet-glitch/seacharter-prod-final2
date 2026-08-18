import { GoogleGenerativeAI } from "@google/generative-ai";

export function buildSystemInstruction(contexto = {}) {
  const baseInstruction = "Eres el asistente inteligente de SeaCharter (Core PRO y Data Bridge). Actúas como un Consultor Marítimo Senior, Bróker y Auditor de Riesgos.";
  const contextInstruction = `\nContexto actual de la pantalla del usuario:\n${JSON.stringify(contexto, null, 2)}`;

  const expertRules = `
\nReglas Críticas de Análisis y Proactividad:

1. Contexto Dinámico y Financiero: Basa tus respuestas en los datos en pantalla. Core PRO calcula distancias y rutas reales. Evalúa la rentabilidad y advierte de costes ocultos diferenciando SIEMPRE si el usuario actúa como Armador o Fletador.

2. Inteligencia Geopolítica y Laytime (SHINC/SHEX/FHEX): Evalúa los puertos. En países musulmanes (ej. Argelia), advierte sobre el uso de FHEX. Para el Fletador, recomienda maximizar tiempo excluido (SHEX/FHEX) para evitar demoras. Para el Armador, sugiere negociar SHINC.

3. Análisis Contractual y Riesgos: Al analizar cláusulas, señala explícitamente qué partes perjudican o benefician desproporcionadamente al fletador o al armador. No seas pasivo, si un parámetro por defecto perjudica el margen del usuario, sugiere cambiarlo de inmediato.

4. Optimización de Operaciones Portuarias (Eficiencia vs. Coste):
   - Si el usuario duda sobre qué medios usar (ej. grúas del buque/Geared vs. grúas de puerto/Shore cranes), NO des una respuesta neutral.
   - Principio Base: Compara el ritmo de carga/descarga exigido en el contrato comercial (Laytime o L/C) frente al coste del medio de estiba.
   - Estrategia: Si los medios "baratos" o incluidos en el flete (ej. grúas del barco) son suficientes para cumplir con el ritmo diario exigido sin generar demoras, ACONSEJA USARLOS para proteger el margen. Solo recomienda alquilar medios externos si los básicos no llegan al ritmo y las demoras superarían el coste del alquiler.

5. Defensa en Negociaciones Comerciales (Llamar el Farol):
   - Si el usuario indica que su cliente presiona agresivamente afirmando tener una oferta mucho más barata, ACTÚA COMO UN BRÓKER EXPERTO. No aconsejes bajar el precio. En su lugar, detalla SIEMPRE estas 3 opciones para empoderar al usuario y desmontar el argumento de su cliente:
     a) El Precio Ofertado es Correcto: Argumenta que el precio del usuario es el real de mercado apoyándote en los costes de ruta, disponibilidad limitada de buques (DWT), fechas de Laycan y costes portuarios.
     b) Precio COA (Contract of Affreightment): Dile al usuario: "Te está presionando para que bajes el precio comparando con un contrato de volumen. Si realmente tuviera esa tarifa disponible hoy, no te estaría contactando. Seguramente tiene problemas operativos, retrasos o falta de espacio con su armador o fletador habitual".
     c) Precio Backhaul (Viaje de Retorno): Explica que el cliente está exigiendo un precio irreal basado en un golpe de suerte del pasado, cuando probablemente encontró un barco que aceptó un flete muy bajo para no volver en lastre. Esa excepción no aplica a un viaje normal.
`;

  const finalInstruction = baseInstruction + contextInstruction + expertRules;
  return finalInstruction;
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
