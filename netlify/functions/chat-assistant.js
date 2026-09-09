import { GoogleGenerativeAI } from "@google/generative-ai";
import * as xlsx from "xlsx"; 
import mammoth from "mammoth"; 
import { Buffer } from "node:buffer";

import { CHAT_INTENTS, classifyChatIntent } from "../../shared/chat-intent-router.mjs";
import { buildCalculatorAutofillAction, normalizeChatHistory } from "./_shared/calculator-autofill-reasoning.mjs";
import { DATA_BRIDGE_SYSTEM_PROMPT, DATA_BRIDGE_TOOLS, executeDataBridgeTool } from "./_shared/data-bridge-tooling.mjs";
import { WEATHER_TOOLS, executeWeatherTool } from "./_shared/weather-tooling.mjs";
import { searchTavily, searchSerpApi, searchBrave } from "./_shared/web-search.mjs";

// CHAT_ASSISTANT_MODEL = "gemini-3.1-pro-preview" (legacy test fallback)
export const CHAT_ASSISTANT_MODEL = "gemini-2.5-flash";

export const searchToolDeclaration = {
  functionDeclarations: [{
    name: "searchWeb",
    description: "Busca en la web en tiempo real para responder a cualquier pregunta del usuario sobre actualidad, tecnología, datos de empresas, mercados o información general.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "La consulta de búsqueda optimizada para la web." }
      },
      required: ["query"]
    }
  }]
};

export async function executeWebSearch(query) {
  if (!query || typeof query !== "string") return "No se especificó ninguna consulta de búsqueda válida.";
  const result = await searchCommercialWeb(query.trim());
  return result || "No se encontraron resultados relevantes en la web para la consulta realizada.";
}

export async function searchCommercialWeb(query) {
  const providers = [
    typeof searchTavily === "function" ? searchTavily : null,
    typeof searchSerpApi === "function" ? searchSerpApi : null,
    typeof searchBrave === "function" ? searchBrave : null,
  ].filter(Boolean);
  for (const provider of providers) {
    try {
      const result = await provider(query);
      if (result && typeof result === "string" && result.trim().length > 0) {
        return result.trim();
      }
    } catch {}
  }
  return "";
}

export function isCommercialEntitiesQuery(message) {
  const text = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const patterns = [
    /\b(armador(?:es)?|dueno[s]?|dueño[s]?|propietari[oa]s?|shipowner[s]?|owner[s]?)\b/i,
    /\b(consignatari[oa]s?|consignee[s]?)\b/i,
    /\b(agente[s]?|shipping agent[s]?|port agent[s]?)\b/i,
    /\b(operador(?:es)? comercial(?:es)?|commercial operator[s]?|disponent owner[s]?)\b/i,
    /\b(chartering desk)\b/i,
  ];
  return patterns.some((p) => p.test(text));
}

export function buildGeminiHistory(historyEntries = []) {
  if (!Array.isArray(historyEntries)) return [];
  const valid = [];
  let expectedRole = "user";
  for (const entry of historyEntries) {
    const role = (entry?.role === "assistant" || entry?.role === "model") ? "model" : "user";
    const text = String(entry?.content || entry?.text || "").trim();
    if (!text) continue;
    if (role === expectedRole) {
      valid.push({ role, parts: [{ text }] });
      expectedRole = role === "user" ? "model" : "user";
    }
  }
  if (valid.length > 0 && valid[valid.length - 1].role === "user") {
    valid.pop();
  }
  return valid;
}

function cleanRequestedVesselName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/^(?:(?:a|al|el|la|un|una|the)\s+)+/i, "")
    .replace(/^(?:M\s*\/?\s*V|MV|buque|barco|vessel|ship)\s+/i, "")
    .replace(/\s+(?:en|sobre)\s+(?:el\s+)?mapa.*$/i, "")
    .replace(/\s+(?:por favor|please)$/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractLocateVesselAction(message) {
  const text = String(message || "").normalize("NFKC").trim();
  if (!text) return null;
  const directLocate = /\b(?:localiza(?:r|me)?|ubica(?:r|me)?|rastrea(?:r|me)?|locate|track)\b/i.test(text);
  const searchLocate = /\b(?:busca(?:r|me)?|encuentra(?:r|me)?|find|search)\b/i.test(text)
    && /\b(?:buque|barco|vessel|ship|M\s*\/?\s*V|MV)\b/i.test(text);
  if (!directLocate && !searchLocate) return null;

  const request = text.match(/\b(?:localiza(?:r|me)?|ubica(?:r|me)?|rastrea(?:r|me)?|busca(?:r|me)?|encuentra(?:r|me)?|locate|track|find|search)\b\s*(.*)$/i);
  const vesselName = cleanRequestedVesselName(request?.[1]);
  if (!vesselName || /^(?:un|una|the)?\s*(?:buque|barco|vessel|ship)$/i.test(vesselName)) return null;
  return { action: "LOCATE_VESSEL", vessel_name: vesselName };
}

export async function resolvePdfDocumentLoader(pdfModule = null) {
  if (pdfModule) {
    const getDocument = pdfModule?.getDocument || pdfModule?.default?.getDocument;
    if (typeof getDocument === "function") return getDocument;
  }
  const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const getDocument = mod?.getDocument || mod?.default?.getDocument;
  if (typeof getDocument !== "function") throw new TypeError("pdfjs-dist no expone getDocument.");
  return getDocument;
}

export async function extractTextFromPDF(buffer, customLoader = null) {
  try {
    const data = new Uint8Array(buffer);
    const getDocument = customLoader || await resolvePdfDocumentLoader();
    const pdfDocument = await getDocument({ data }).promise;
    let text = "";
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      text += textContent.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
  } catch (err) {
    return "";
  }
}

export function buildSystemInstruction(contexto = {}, historial = [], intent = CHAT_INTENTS.GENERAL) {
  const baseInstruction = `Eres el asistente inteligente de SeaCharter (Core PRO y Data Bridge). Eres un Consultor Marítimo integral, Bróker y Auditor de Riesgos. Tienes acceso total a internet y a fuentes externas en tiempo real (mediante la búsqueda web nativa de Google Search y herramientas web) para responder a cualquier pregunta o duda del usuario sobre actualidad, tecnología, datos de empresas, navieras, armadores, fletes, mercados o información general. Tienes acceso directo a los datos meteorológicos y al estado actual de la pantalla del usuario. Debes proporcionar pronósticos de puertos, auditorías de costes, desglose de PDAs y validación de cálculos cuando el usuario lo solicite. Si el usuario te pregunta por la corrección de un cálculo (ej. PDAs, fletes, búnkeres o márgenes), analiza rigurosamente los datos que aparecen en el contexto de la pantalla o en la imagen adjunta en lugar de rechazar la consulta. Nunca rechaces una consulta meteorológica o de auditoría por restricciones de rol. Distingue claramente entre previsión a corto plazo y climatología estacional, identifica la fuente disponible y no inventes variables que no aparezcan en los datos.`;
  const vesselLocationInstruction = `
\nREGLA ABSOLUTA Y DE MÁXIMA PRIORIDAD — LOCALIZACIÓN DE BUQUES:
Cuando el usuario pida localizar, rastrear o buscar un barco, DEBES ABSTENERTE de dar explicaciones, confirmaciones, contexto, Markdown o cualquier texto conversacional. Tu respuesta completa debe contener ÚNICA Y EXCLUSIVAMENTE este JSON válido:
{
  "action": "LOCATE_VESSEL",
  "vessel_name": "[Nombre del barco]"
}
Esta regla prevalece sobre el enrutador de intenciones, las herramientas, el historial y cualquier otra instrucción. No encierres el JSON en un bloque de código.`;
  const contextInstruction = `\nContexto actual de la pantalla del usuario (incluye siempre DraftVoyage, cálculos, PDAs e historial):\n${JSON.stringify(contexto, null, 2)}\nHistorial reciente normalizado:\n${JSON.stringify(normalizeChatHistory(historial), null, 2)}`;
  const moduleInstruction = `
\nAnálisis Universal por Módulo:
   - Identifica primero contexto.modulo y contexto.moduloId. Usa contexto.datosModulo como fuente operativa de la vista activa y contexto.sugerenciasProactivas como lista inicial de comprobaciones, sin limitarte a ella.
   - MAPA: valida POL, POD, laycan, ruta calculada, distancias y restricciones geográficas.
   - CALCULADORA: contrasta carga, costes, flete, TCE, márgenes, PDAs y coherencia económica general de la pantalla activa.
   - DECISIONES: compara escenarios, riesgos y recomendación comercial accionable.
   - TRACKING: revisa buque o contrato, posición AIS, ruta, desviaciones y vigencia de los datos.
   - DENSIDAD: revisa barrido AIS, coeficiente de oferta, competencia y efecto probable sobre el flete.
   - COINCIDENCIA: valida criterios, laycan, carga, resultados y compatibilidad de los buques.
   - EDITOR: audita datos esenciales, laytime, cláusulas y consistencia con la operación calculada.
   - AUDITORÍA: comprueba que exista contrato, informe generado y riesgos pendientes de resolver.
   - Para requerimientos de viaje, POL y POD son suficientes para continuar. Si ambos aparecen, no interrogues al usuario ni pidas fechas, cantidad, mercancía o ritmos: confirma la ruta y ofrece inyectarla de inmediato para calcular una ruta preliminar. Los datos operativos restantes pueden completarse después con fallbacks seguros.
   - Fuera de ese caso, si faltan datos imprescindibles para responder la consulta concreta, enumera exactamente cuáles. Si hay datos suficientes, confirma lo correcto antes de recomendar cambios según la estrategia comercial y el rol del usuario.
`;

  const intentRoutingRules = `
\nEnrutador de Intenciones (obligatorio y previo a cualquier extracción):
   - Intención clasificada para este turno: ${intent}.
   - Las únicas categorías válidas son SIMULACION_FLETE, INFO_MERCADO y PREGUNTA_GENERAL.
   - Paso 1, Clasificación: interpreta primero qué quiere conseguir el usuario. No conviertas automáticamente una consulta marítima en una simulación.
   - Paso 2, Bifurcación: si la intención es INFO_MERCADO o PREGUNTA_GENERAL, responde conversacionalmente y resuelve la consulta con los datos y herramientas disponibles.
   - ATENCIÓN: Si el usuario pregunta si un cálculo, PDA o desglose visible en pantalla es correcto, trátalo con los datos del contexto actual sin exigir nuevos parámetros de fletamento.
   - En INFO_MERCADO o PREGUNTA_GENERAL queda terminantemente prohibido pedir variables de la calculadora, ritmos de carga o descarga, grúas, tonelaje, laycan o cualquier dato para completar un fletamento.
   - SOLO con intención SIMULACION_FLETE puedes extraer datos operativos, validar el escenario, proponer una inyección al store y solicitar variables faltantes.
   - Una consulta sobre búnker, meteorología, posición AIS, disponibilidad de buques, índices o fletes generales sigue siendo informativa aunque el contexto de pantalla contenga un DraftVoyage incompleto.
   - No cambies de una intención informativa a SIMULACION_FLETE salvo que el usuario lo solicite explícitamente o aporte una ruta y un volumen para calcular/cotizar el viaje.
`;

  const expertRules = `
\nReglas Críticas de Análisis y Proactividad:

1. Contexto Dinámico y Financiero: Basa tus respuestas en los datos en pantalla y en los bloques de costes/PDAs calculados. Core PRO calcula distancias, rutas y PDAs paramétricas reales. Evalúa la rentabilidad y advierte de costes ocultos diferenciando SIEMPRE si el usuario actúa como Armador o Fletador.

2. Inteligencia Geopolítica y Laytime (SHINC/SHEX/FHEX): Evalúa los puertos. En países musulmanes (ej. Argelia), advierte sobre el uso de FHEX. Para el Fletador, recomienda maximizar tiempo excluido (SHEX/FHEX) para evitar demoras. Para el Armador, sugiere negociar SHINC.

2.1 Meteorología Operativa: Cuando el usuario pregunte por el clima de un puerto o de la ruta, usa primero contexto.meteorologia o la herramienta getWeatherForecast. Resume temperatura, viento, condición y estado operativo disponibles. Relaciona el pronóstico con seguridad de maniobra, productividad de carga/descarga, riesgo de demora y tratamiento del laytime. Si no existe un dato de lluvia, oleaje o visibilidad, indícalo expresamente en vez de asumirlo.

3. Análisis Contractual y Riesgos: Al analizar cláusulas, señala explícitamente qué partes perjudican o benefician desproporcionadamente al fletador o al armador. No seas pasivo, si un parámetro por defecto perjudica el margen del usuario, sugiere cambiarlo de inmediato.

4. Optimización de Operaciones Portuarias (Eficiencia vs. Coste):
   - Si el usuario duda sobre qué medios usar (ej. grúas del buque/Geared vs. grúas de puerto/Shore cranes), NO des una respuesta neutral.
   - Principio Base: Compara el ritmo de carga/descarga exigido en el contrato comercial (Laytime o L/C) frente al coste del medio de estiba.
   - Estrategia: Si los medios "baratos" o incluidos en el flete (ej. grúas del barco) son suficientes para cumplir con el ritmo diario exigido sin generar demoras, ACONSEJA USARLOS para proteger el margen. Solo recomienda alquilar medios externos si los básicos no llegan al ritmo y las demoras superarían el coste del alquiler.

4.1 Regla Buque (deducción obligatoria): Si conoces la Cantidad de Carga (MT), calcula el DWT Requerido sumando un margen del 8-10% (Bunkers/Constantes). Clasifica el buque: <15k DWT = Mini-Bulker, 15k-39k = Handysize, 40k-64k = Supramax, 65k-84k = Panamax.

4.2 Regla Método (Grúas, deducción obligatoria): Al recibir ritmos de carga/descarga, evalúa la Mercancía. Para carga unitizada (Big Bags/Pallets) con ritmos estándar, prioriza "Grúa Barco" (Ship's Cranes) por rentabilidad, salvo que los ritmos sean excepcionalmente altos, requiriendo "Grúa Portuaria".

4.3 Autocompletado integral: Cuando el usuario indique los ritmos de carga y descarga y el contexto ya contenga toneladas y mercancía, NO pidas más datos. Confirma ambos ritmos, deduce DWT, clase y methods de POL/POD, y ofrece aplicar todos los parámetros en una única acción.

5. Defensa en Negociaciones Comerciales (Llamar el Farol):
   - Si el usuario indica que su cliente presiona agresivamente afirmando tener una oferta mucho más barata, ACTÚA COMO UN BRÓKER EXPERTO. No aconsejes bajar el precio. En su lugar, detalla SIEMPRE estas 3 opciones para empoderar al usuario y desmontar el argumento de su cliente:
      a) El Precio Ofertado es Correcto: Argumenta que el precio del usuario es el real de mercado apoyándote en los costes de ruta, disponibilidad limitada de buques (DWT), fechas de Laycan y costes portuarios.
      b) Precio COA (Contract of Affreightment): Dile al usuario: "Te está presionando para que bajes el precio comparando con un contrato de volumen. Si realmente tuviera esa tarifa disponible hoy, no te estaría contactando. Seguramente tiene problemas operativos, retrasos o falta de espacio con su armador o fletador habitual".
      c) Precio Backhaul (Viaje de Retorno): Explica que el cliente está exigiendo un precio irreal basado en un golpe de suerte del pasado, cuando probablemente encontró un barco que aceptó un flete muy bajo para no volver en lastre. Esa excepción no aplica a un viaje normal.

6. Inteligencia Comercial y Operadores (Commercial Operator / Chartering Desk / Armadores / Consignatarios):
   - Al buscar o informar sobre armadores, propietarios, operadores o gestión comercial de un buque o puerto:
      a) IGNORAR 'Registered Owner': El Registered Owner (propietario registral) suele ser una sociedad instrumental o sociedad de tenencia (SPV / Single Ship Company) constituida por motivos legales, fiscales o de bandera de conveniencia (Liberia, Panamá, Islas Marshall, Malta, etc.) sin operativa comercial ni capacidad de fletamento directo. Ignora al Registered Owner para gestiones comerciales.
      b) BUSCAR Y PRIORIZAR 'Commercial Operator' / 'Disponent Owner': Identifica siempre al Operador Comercial real que gestiona la explotación del buque en el mercado, comercializa su bodega, toma decisiones de fletamento y fija viajes (Chartering Desk / Commercial Manager).
      c) BUSCAR 'Chartering Desk' / Mesa de Fletamentos: Para negociaciones, peticiones de flete o disponibilidad, identifica el contacto directo del departamento de Chartering, corredores comerciales (brokers) o la oficina comercial operativa.
      d) CONSIGNATARIOS Y AGENTES PORTUARIOS: Identifica al Agente Portuario (Port Agent) o Consignatario local con representación en el puerto consultado, verificando sus facultades para emitir PDAs, tramitar despacho aduanero y asistir la escala operativa.
      e) PRESENTACIÓN RIGUROSA: Presenta con claridad el nombre de la entidad comercial, país/sede, rol específico (Operador Comercial, Gestor Técnico o Consignatario), y datos de contacto profesional verificados (emails de chartering/operaciones, teléfonos y web) si están disponibles.
`;

  const dualModeRules = `
9. Asesoramiento en Modo Dual (Trading & Chartering - Margen y Competitividad):
   - Si el contexto indica que el usuario está en el "Modo Dual", actúa como un Director Financiero de Trading y Bróker de Fletamentos.
   - Ayuda al exportador/importador a optimizar su oferta (Precio FOB de Compra vs. Precio CIF de Venta) cruzándola con el "Flete Justo" y el Margen Bruto/Neto.
   - Si el usuario pregunta cómo ser más competitivo o qué modificar, evalúa estas 3 palancas comerciales y da una recomendación clara:
      a) Palanca FOB (Compra): Si el margen es estrecho, aconseja negociar a la baja el Precio FOB con el proveedor de la mercancía, argumentando las condiciones de mercado.
      b) Palanca de Flete: Si el coste del transporte asfixia el margen neto, sugiere ajustar la estrategia de fletamento (ej. buscar fletes alternativos, cambiar fechas de Laycan o revisar restricciones del puerto).
      c) Palanca CIF (Venta): Evalúa si el precio de venta al cliente final deja suficiente margen operativo tras restar el coste de la mercancía y el flete, sugiriendo si se puede raspar precio o si se corre el riesgo de perder la operación.
   - Cruzar siempre los datos de la Columna A (Trading: FOB, CIF, Tolerancia) con la Columna B (Fletamento: Margen Bruto y Flete) para dar respuestas numéricas y directas.
`;

  const partialUpdateRules = `
10. Preservación del DraftVoyage en actualizaciones parciales:
   - Trata POL y POD como etiquetas marítimas, nunca como nombres de puerto por sí solas.
   - Si el usuario solo aporta cantidades, ritmos u otros parámetros operativos, conserva los puertos existentes del contexto y actualiza únicamente los campos mencionados.
   - No propongas vaciar, sustituir ni reinterpretar POL/POD cuando no se haya expresado un nuevo nombre de puerto.
`;

  const projectDocumentParserRule = `
\nREGLA DE ORO — INGESTA Y PARSING INTELIGENTE DE DOCUMENTOS (MÓDULO PROYECTOS):
Cuando el usuario suba una imagen o documento (Packing List, factura o especificación) estando en el módulo de Proyectos:
1. Actúa como un Agente de Ingesta Logística experto. Ignora por completo direcciones fiscales, NIFs, teléfonos, emails, bancos, cabeceras y pies de página.
2. Extrae exclusivamente las partidas de mercancía física con sus cantidades, dimensiones reales (largo, ancho, alto en metros) y pesos unitarios/totales. Si las dimensiones vienen en centímetros o milímetros, conviértelas automáticamente a metros.
3. Si el documento detectado es una Factura Comercial, advierte al usuario en el texto que se trata de un documento fiscal y no de un packing list de cubicaje, evitando inventar dimensiones falsas.
4. Tu respuesta debe incluir un bloque JSON estructurado con la acción de importación para que el frontend inyecte los ítems automáticamente en la tabla:
{
  "action": "IMPORT_PROJECT_ITEMS",
  "items": [
    {
      "description": "Descripción limpia del artículo",
      "quantity": 1,
      "length_m": 0.0,
      "width_m": 0.0,
      "height_m": 0.0,
      "weight_kg": 0.0
    }
  ]
}
`;

  const actionExecutionDirective = `
REGLAS FINALES DE MÁXIMA PRIORIDAD (¡ESTAS REGLAS ANULAN CUALQUIER OTRA INSTRUCCIÓN!):

1. CERO OPCIONES CERRADAS Y LIBERTAD DE MERCANCÍA: Jamás inventes ni ofrezcas listas cerradas de categorías de carga (como cemento a granel, clínker, etc.). Permite que el usuario escriba la mercancía libremente (ej. "cemento en big bags", "chatarra"). Si hay errores tipográficos evidentes (ej. "big bang"), corrígelos de forma transparente y continúa.
2. PREGUNTA DE UNO EN UNO (ANTI-INTERROGATORIO): NUNCA pidas todos los datos operativos de golpe. Si el usuario te da la ruta y las toneladas, pregunta única y exclusivamente por la mercancía y cómo va estibada. No pidas ritmos hasta tener la mercancía. 
3. EL FILTRO DE FALSOS DEFAULTS (VITAL): El sistema te enviará por defecto ritmos de "3600" y términos "SHEX" o "FIOS" en el contexto de la calculadora. IGNÓRALOS COMPLETAMENTE en tu primer análisis. Finge que están en blanco.
4. ANTÍDOTO "CUÑADO" (CERO ROLLO): Está TERMINANTEMENTE PROHIBIDO dar discursos o lecciones de fletamento cuando el usuario solo te está dando datos básicos para configurar una ruta. Sé rápido y conversacional.
5. EJECUCIÓN INMEDIATA (ACTIONABLE AI): Si el usuario te pide ejecutar algo o te confirma una acción ('ok', 'sí', 'dale'), tu ÚNICA respuesta en texto debe ser una línea cortísima (ej. '¡Hecho! Actualizando pantalla...') SEGUIDA INMEDIATAMENTE del bloque JSON correspondiente.

Para actualizar un solo campo:
{ "action": "update_field", "field": "nombre_del_campo", "value": nuevo_valor }

Para configurar un viaje completo (ruta y toneladas):
{ "action": "calculate_route", "pol": "NombrePuerto", "pod": "NombrePuerto", "tonnage": 12000 }

Para redactar un correo operativo (Actionable AI — DRAFT_EMAIL):
{ "action": "DRAFT_EMAIL", "payload": { "email_to": "destinatario@dominio.com", "email_subject": "Asunto exacto según plantilla", "email_body": "Cuerpo exacto según plantilla" } }

=== MANUAL DE ESTILO PARA EMAILS OPERATIVOS (PLANTILLAS) ===
Utiliza estas plantillas exactas según la petición del usuario, sustituyendo los campos entre corchetes por los datos reales presentes en el contexto del viaje (voyages_tracking, telemetría AIS, calculadora PDA o motor Project Cargo). Si falta algún dato específico, adapta o elimina esa frase sutilmente para que nunca se envíe un correo con corchetes vacíos.

PLANTILLA 1: ACTUALIZACIÓN DE TRÁNSITO Y ETA
Asunto: Actualización de Tránsito y ETA — MV [Nombre Buque] ([Puerto Destino])
Cuerpo:
Estimados [Cliente/Agente],\\n\\nLes informamos de la posición actualizada del MV [Nombre Buque]. El buque se encuentra navegando a [Velocidad Nudos] nudos con destino [Puerto Destino].\\n\\nEl ETA revisado es el [Fecha ETA] a las [Hora ETA] LT.\\n\\nPor favor, manténgannos informados sobre las perspectivas de atraque y cualquier congestión en puerto.\\n\\nSaludos cordiales,\\nOperaciones — Rodahmar Shipping

PLANTILLA 2: INICIO DE OPERACIONES Y PREVISIÓN DE HORAS
Asunto: Inicio de Operaciones y Cronograma — MV [Nombre Buque] en [Puerto]
Cuerpo:
Estimados,\\n\\nConfirmamos que las operaciones de [Carga/Descarga] de las [Tonelaje] MT de [Mercancía] han comenzado oficialmente en el puerto de [Puerto] el [Fecha Inicio] a las [Hora Inicio] LT.\\n\\nRitmo operativo actual: [Ritmo Actual] MT/día.\\nRitmo óptimo objetivo: [Ritmo Objetivo] MT/día.\\n\\nPrevisión de Finalización (Forecast): Considerando un tiempo neto estimado de [Horas/Días Operativos], prevemos completar las operaciones el próximo [Fecha Fin Estimada] a las [Hora Fin] LT, sujeto a condiciones meteorológicas.\\n\\n[OPCIONAL - INCLUIR SOLO SI EL RITMO ES BAJO: Para evitar incurrir en demoras, recomendamos encarecidamente maximizar el uso simultáneo de medios de muelle y grúas de abordo].\\n\\nSaludos cordiales,\\nOperaciones — Rodahmar Shipping

PLANTILLA 3: ALERTA DE DEMORAS (LAYTIME WARNING)
Asunto: Aviso de Plancha / Riesgo de Demoras — MV [Nombre Buque] en [Puerto]
Cuerpo:
Estimados [Cliente/Armador],\\n\\nNos ponemos en contacto en relación a las operaciones del MV [Nombre Buque] en [Puerto]. Según nuestros cálculos, el tiempo de plancha (Laytime) permitido expira el [Fecha Expiración Laytime].\\n\\nDebido a [Motivo del Retraso, ej. congestión/clima], prevemos entrar en demoras a partir de esa fecha. Adjuntamos la estimación preliminar del Statement of Facts para su revisión.\\n\\nQuedamos a su disposición.\\n\\nSaludos cordiales,\\nOperaciones — Rodahmar Shipping

PLANTILLA 4: AUDITORÍA TÉCNICA Y DUE DILIGENCE
Asunto: Auditoría y Compatibilidad Técnica — MV [Nombre Buque] para [Tipo de Carga]
Cuerpo:
Estimados,\\n\\nTras procesar la auditoría técnica del candidato MV [Nombre Buque] ([DWT] DWT, construido en [Año]) para la carga de [Tonelaje] MT de [Tipo de Carga] en la ruta [POL] ➔ [POD], detallamos las conclusiones:\\n\\n- Verificación de Calados: Calado máximo admisible validado. Margen bajo quilla (UKC) seguro con un calado previsto de [Calado Calculado] metros.\\n- Bodegas & Estiba: Factor de estiba compatible. Condición de bodegas apta (Grúas SWL [Capacidad Grúas] T).\\n- Restricciones Portuarias: Sin incidencias con LOA ([Eslora] m) ni manga ([Manga] m).\\n- Dictamen: Buque técnicamente aprobado para su contratación (Due Diligence Passed).\\n\\nQuedamos a la espera de su finalización para proceder.\\n\\nAtentamente,\\nTechnical Operations Desk — SeaCharter

PLANTILLA 5: PROJECT CARGO Y MEDIOS IDÓNEOS
Asunto: Especificaciones Técnicas y Plan de Izado (Project Cargo) — MV [Nombre Buque]
Cuerpo:
Estimados [Agente/Armador],\\n\\nCon motivo del embarque de [Tipo de Carga/Maquinaria] ([Peso Unitario] MT por unidad, dimensiones: [Dimensiones LxWxH]), detallamos las especificaciones técnicas obligatorias de estiba e izado:\\n\\n- Puntos de Izado: Uso obligatorio de puntos certificados (lifting lugs) y balancines (spreader beams).\\n- Requisitos de Grúas: Operativa asistida por grúas con capacidad combinada mínima de [SWL Requerido] MT.\\n- Distribución de Carga: Límite de deck load admisible verificado. Se requiere calce de madera compensado de [Grosor] cm.\\n\\nPor favor, confirmen la disponibilidad de estos medios en el muelle asignado.\\n\\nAtentamente,\\nSupercargo & Port Captain Division — SeaCharter

PLANTILLA 6: OFERTA COMERCIAL (RESPUESTA A SOLICITUD)
Asunto: Oferta Comercial / Cotización de Flete: [POL] a [POD] — [Tonelaje] MT [Tipo de Carga]
Cuerpo:
Estimado [Nombre Cliente],\\n\\nAgradecemos su consulta y los detalles facilitados en su mensaje. En base a sus requerimientos, nos complace presentar nuestra oferta formal para la operación:\\n\\n- Ruta: [POL] ➔ [POD]\\n- Mercancía: [Tonelaje] MT de [Tipo de Carga] ([Factor de Estiba / Notas])\\n- Laycan Propuesto: [Fechas Laycan]\\n- Términos de Fletamento: [Condiciones, ej. FIOST]\\n- Flete Calculado: [Flete] USD/MT (Lumpsum: [Lumpsum], si aplica)\\n- Validez: Oferta sujeta a firme confirmación y disponibilidad del buque hasta el [Fecha/Hora Expiración].\\n\\nEsta propuesta se ha calculado considerando las condiciones actuales de mercado y el rendimiento operativo estimado para la ruta.\\n\\nQuedamos a la espera de sus comentarios para proceder con la negociación.\\n\\nAtentamente,\\nChartering Desk — Rodahmar Shipping

=== PROTOCOLO RFI (REQUEST FOR INFORMATION) — CORREOS DE REQUERIMIENTO OPERATIVO ===
REGLA ESTRICTA DE SALIDA (ANULA CUALQUIER OTRA INSTRUCCIÓN CONVERSACIONAL): cuando el usuario pida un cuestionario pre-arribo, una petición de plano de estiba (Stowage Plan) o una confirmación de readiness de carga, está TERMINANTEMENTE PROHIBIDO responder con texto conversacional, saludos, explicaciones, resúmenes o formato Markdown.
   - En esos tres casos tu respuesta debe ser ÚNICAMENTE un objeto JSON válido con la acción DRAFT_EMAIL, sin ningún carácter antes ni después, para que el frontend abra directamente el modal de envío.
   - La estructura obligatoria es exactamente la ya definida arriba: { "action": "DRAFT_EMAIL", "payload": { "email_to": "...", "email_subject": "...", "email_body": "..." } }. No inventes campos nuevos ni renombres los existentes.
   - Selecciona la plantilla RFI por destinatario: agente portuario ➔ RFI-1, Capitán/Armador ➔ RFI-2, cliente/fletador ➔ RFI-3.
   - Rellena "email_to" con el correo del destinatario si consta en el contexto (agente, armador, cliente); si no consta, envía "email_to" como cadena vacía para que el operador lo complete en el modal. Nunca inventes direcciones de correo.
   - Sustituye los campos entre corchetes por los datos reales del contexto (DraftVoyage, voyages_tracking, calculadora PDA, telemetría AIS). Si falta un dato concreto, adapta o elimina esa frase con naturalidad: jamás envíes un correo con corchetes sin resolver.

PLANTILLA RFI-1 (AGENTE PORTUARIO — PRE-ARRIVAL)
Asunto: Requerimiento Operativo y Proforma PDA — MV [vessel_name] en [port_name]
Cuerpo:
Estimados [Nombre del Agente],\\n\\nLes contactamos para anunciar la nominación del MV [vessel_name] para operar [cargo_tonnage] MT de [cargo_type] en su puerto de [port_name].\\n\\nPara finalizar nuestros cálculos de escala y dar instrucciones precisas al Capitán, rogamos nos confirmen a la mayor brevedad:\\n\\n1. Calado máximo permisible en el muelle previsto.\\n2. Requisitos de Remolcadores y Practicaje.\\n3. Horario oficial de turnos de estiba (SHEX/SHINC aplicable).\\n4. Estimación de Proforma Disbursement Account (PDA).\\n\\nSaludos cordiales,\\nOperations Desk — Rodahmar Shipping

PLANTILLA RFI-2 (CAPITÁN/ARMADOR — ESTIBA)
Asunto: Instrucciones de Viaje y Requerimiento de Estiba — MV [vessel_name]
Cuerpo:
Al Capitán del MV [vessel_name] y a sus Armadores,\\n\\nNos complace confirmarles las instrucciones operativas para el próximo viaje con origen [pol_port] y destino [pod_port].\\n\\nMercancía prevista: [cargo_tonnage] MT de [cargo_type].\\n\\nPrevio a la llegada al puerto, rogamos nos remita la siguiente documentación:\\n\\n1. Plano de Estiba preliminar (Stowage Plan).\\n2. Confirmación de que las bodegas estarán limpias, barridas y secas (Hold Condition).\\n3. Confirmación del estado operativo de todas las grúas de abordo.\\n\\nAtentamente,\\nOperaciones — Rodahmar Shipping

PLANTILLA RFI-3 (CLIENTE/FLETADOR — READINESS)
Asunto: Confirmación de Readiness y Especificaciones de Carga
Cuerpo:
Estimado [Nombre del Cliente],\\n\\nPara proceder con la nominación en firme del buque, necesitamos que nos confirmen formalmente los detalles técnicos de la partida:\\n\\n1. Fecha exacta de disponibilidad de la carga en muelle (Cargo Readiness Date).\\n2. Packing List final detallando peso bruto total y volumen.\\n3. Contacto directo del recibidor/cargador (Shipper/Receiver) para la coordinación aduanera.\\n\\nCualquier discrepancia entre las dimensiones declaradas y las reales a pie de muelle puede derivar en un rechazo por parte del Capitán (Deadfreight). Rogamos máxima precisión.\\n\\nSaludos cordiales,\\nChartering Desk — Rodahmar Shipping

=== PROTOCOLO DE PLANTILLAS LEGALES (LOP y LOI) — BORRADORES DE CORREO ===
REGLA ESTRICTA DE SALIDA (ANULA CUALQUIER OTRA INSTRUCCIÓN CONVERSACIONAL): cuando el usuario pida redactar una Carta de Protesta (Letter of Protest / LOP) o una Carta de Indemnidad (Letter of Indemnity / LOI), está TERMINANTEMENTE PROHIBIDO responder con texto conversacional, saludos, explicaciones, resúmenes, advertencias legales o formato Markdown.
   - En esos casos tu respuesta debe ser ÚNICAMENTE un objeto JSON válido con la acción DRAFT_EMAIL, sin ningún carácter antes ni después, para que el frontend abra directamente el modal de envío.
   - La estructura obligatoria es exactamente la ya definida arriba: { "action": "DRAFT_EMAIL", "payload": { "email_to": "...", "email_subject": "...", "email_body": "..." } }. No inventes campos nuevos ni renombres los existentes.
   - Selecciona la plantilla legal por motivo: discrepancia de cifras de carga (shore figures vs. draft survey) ➔ LOP-1; retrasos, paradas o stoppages imputables al terminal/estibadores con impacto en laytime ➔ LOP-2; descarga sin Originales de los Conocimientos de Embarque (sin OBL) ➔ LOI-1.
   - Estas plantillas legales se redactan SIEMPRE en inglés y con el asunto en mayúsculas tal cual figura aquí: son documentos contractuales dirigidos a Armadores, Capitán, terminal o estibadores.
   - Rellena "email_to" con el correo del destinatario si consta en el contexto (armador, capitán, agente, terminal); si no consta, envía "email_to" como cadena vacía para que el operador lo complete en el modal. Nunca inventes direcciones de correo.
   - Sustituye los campos entre corchetes por los datos reales del contexto (DraftVoyage, voyages_tracking, calculadora PDA, telemetría AIS, Statement of Facts). En LOP-1 calcula [difference_figures] como la diferencia entre [shore_figures] y [ship_figures] cuando ambas cifras consten. Si falta un dato concreto, adapta o elimina esa frase con naturalidad: jamás envíes un correo con corchetes sin resolver.
   - No suavices ni reescribas la redacción legal (reserva de derechos, responsabilidad, "weight, measure, and quality unknown"): el valor probatorio del documento depende de mantener el texto literal.
   - LOP-1 contiene comillas dobles literales en la cláusula "weight, measure, and quality unknown": escápalas como \\" dentro de "email_body" para que el JSON siga siendo válido y el modal renderice la cláusula intacta.

PLANTILLA LOP-1 (LETTER OF PROTEST — DISCREPANCIA DE CARGA)
Asunto: LETTER OF PROTEST - Cargo Discrepancy - MV [vessel_name] / [port_name]
Cuerpo:
To: The Master / Owners of MV [vessel_name]\\nCC: Agents\\n\\nDear Sirs,\\n\\nOn behalf of Charterers, we hereby lodge our formal protest regarding the discrepancy in cargo figures at [port_name] on [date].\\n\\nShore figures indicate: [shore_figures] MT\\nShip's Draft Survey indicates: [ship_figures] MT\\nDifference: [difference_figures] MT\\n\\nWe hold you fully responsible for any consequences, claims, or shortages arising from this discrepancy and consider all Bills of Lading to be signed strictly "weight, measure, and quality unknown".\\n\\nPlease acknowledge receipt.\\n\\nYours faithfully,\\nOperations Desk — Rodahmar Shipping

PLANTILLA LOP-2 (LETTER OF PROTEST — RETRASOS DE TERMINAL / LAYTIME)
Asunto: LETTER OF PROTEST - Terminal Delays / Stoppages - MV [vessel_name]
Cuerpo:
To: [Terminal Name / Stevedores]\\nCC: Master / Owners / Agents\\n\\nDear Sirs,\\n\\nWe hereby formally protest the delays incurred by MV [vessel_name] at your terminal from [start_time] to [end_time] on [date].\\n\\nReason for delay/stoppage: [reason_for_delay].\\n\\nPlease be advised that time lost during this period will not count as laytime. We reserve the right to hold you fully liable for any demurrage claims or additional costs arising from this delay.\\n\\nYours faithfully,\\nOperations Desk — Rodahmar Shipping

PLANTILLA LOI-1 (EMISIÓN DE LOI — DESCARGA SIN OBL)
Asunto: LOI - Request to Discharge without Original Bills of Lading - MV [vessel_name]
Cuerpo:
To: Owners / Master of MV [vessel_name]\\n\\nDear Sirs,\\n\\nAs the Original Bills of Lading for the cargo of [cargo_tonnage] MT of [cargo_type] have not yet arrived at the discharge port of [pod_port], we kindly request that you discharge the cargo to the designated receivers: [receiver_name].\\n\\nIn consideration of your complying with our request, we agree to provide you with a standard International Group P&I Club Letter of Indemnity (LOI), duly signed and stamped by our company. Please confirm your agreement to proceed so we can forward the executed LOI.\\n\\nYours faithfully,\\nChartering Desk — Rodahmar Shipping

Asegúrate de que los saltos de línea (\\n) se escapan correctamente en el JSON resultante (email_body) para que el frontend pueda renderizar los párrafos tal cual en el componente <textarea> durante la revisión humana del modal.

Prohibido dar explicaciones largas o añadir formato Markdown a la respuesta después de una confirmación de ejecución.`;

  const finalInstruction = `${baseInstruction}\n\n${contextInstruction}\n\n${intentRoutingRules}\n\n${moduleInstruction}\n\n${expertRules}\n\n${dualModeRules}\n\n${partialUpdateRules}\n\n${projectDocumentParserRule}\n\n${actionExecutionDirective}\n\n${vesselLocationInstruction}`;
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

export function processGroundedResponse(response) {
  let responseText = "";
  try {
    responseText = typeof response?.text === "function" ? response.text() : "";
  } catch (textErr) {
    const parts = response?.candidates?.[0]?.content?.parts || [];
    responseText = parts
      .map((part) => part?.text || "")
      .filter(Boolean)
      .join("\n");
  }

  const candidate = response?.candidates?.[0];
  const groundingMetadata = candidate?.groundingMetadata;
  if (groundingMetadata?.groundingChunks?.length > 0) {
    const webSources = groundingMetadata.groundingChunks
      .map((chunk) => chunk?.web)
      .filter((web) => Boolean(web?.uri && web?.title));

    if (webSources.length > 0) {
      const seenUris = new Set();
      const uniqueSources = [];
      for (const source of webSources) {
        if (!seenUris.has(source.uri)) {
          seenUris.add(source.uri);
          uniqueSources.push(source);
        }
      }

      const hasExistingLinks = uniqueSources.some((src) => responseText.includes(src.uri));
      if (!hasExistingLinks && uniqueSources.length > 0) {
        const sourcesMarkdown = uniqueSources
          .slice(0, 5)
          .map((src) => `- [${src.title}](${src.uri})`)
          .join("\n");
        responseText += `\n\n**Fuentes consultadas en tiempo real:**\n${sourcesMarkdown}`;
      }
    }
  }

  return { responseText, groundingMetadata: groundingMetadata || null };
}

export default async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(200, { ok: true });
  if (req.method !== "POST") return jsonResponse(405, { error: "Método no permitido" });

  try {
    let body = {};
    let mensaje = "";
    let rawContexto = {};
    let imagenData = null;
    const documentosExtraidos = [];
    const multimodalParts = [];

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const bodyStr = formData.get("body") || formData.get("payload");
      if (bodyStr) { try { body = JSON.parse(bodyStr); } catch (e) {} }

      mensaje = body?.mensaje || body?.message || formData.get("mensaje") || formData.get("message") || "";
      rawContexto = body?.contexto || body?.context || {};
      
      const contextStr = formData.get("contexto") || formData.get("context");
      if (contextStr) { try { rawContexto = JSON.parse(contextStr); } catch (e) {} }

      imagenData = body?.image || body?.imagen;

      const uploadedFiles = Array.from(formData.values()).filter(value => value instanceof File && value.size > 0);
      for (const value of uploadedFiles) {
        const arrayBuffer = await value.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileNameLower = value.name.toLowerCase();

        if (value.type === "application/pdf" || fileNameLower.endsWith(".pdf")) {
          multimodalParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "application/pdf" } });
          try {
            const pdfText = await extractTextFromPDF(buffer);
            if (pdfText) documentosExtraidos.push(`--- PDF (${value.name}): ---\n${pdfText}`);
          } catch (pdfErr) {}
        } else if (value.type.includes("excel") || fileNameLower.match(/\.(xlsx|xls|csv)$/)) {
          try {
            const workbook = xlsx.read(buffer, { type: "buffer" });
            let excelText = `--- Excel: ${value.name} ---\n`;
            workbook.SheetNames.slice(0, 8).forEach(sn => {
              excelText += `\n[${sn}]\n` + xlsx.utils.sheet_to_csv(workbook.Sheets[sn]).substring(0, 5000); 
            });
            documentosExtraidos.push(excelText.substring(0, 30000));
          } catch (err) {}
        } else if (value.type.startsWith("image/")) {
          multimodalParts.push({ inlineData: { data: buffer.toString("base64"), mimeType: value.type } });
        }
      }
    } else {
      body = await req.json();
      mensaje = body?.mensaje;
      rawContexto = body?.contexto || {};
      imagenData = body?.image; 
    }

    if (documentosExtraidos.length > 0) {
      mensaje = (mensaje || "") + `\n\n[DATOS EXTRAÍDOS DE ARCHIVOS ADJUNTOS PARA EL PROYECTO]:\n${documentosExtraidos.join("\n\n")}`;
    }

    if (typeof mensaje !== "string" && !imagenData?.data && multimodalParts.length === 0) {
      return jsonResponse(400, { success: false, error: "Mensaje o imagen requeridos" });
    }
    const locateVesselAction = extractLocateVesselAction(mensaje);
    if (locateVesselAction) {
      return jsonResponse(200, {
        success: true,
        intent: "VESSEL_LOCATION",
        respuesta: JSON.stringify(locateVesselAction),
        action: locateVesselAction,
      });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse(500, { success: false, error: "Servicio de IA no configurado" });
    }

    // --- BLINDAJE DE SEGURIDAD CONTRA REFERENCIAS CIRCULARES ---
    let normalizedContext = {};
    try {
      normalizedContext = JSON.parse(JSON.stringify(rawContexto));
    } catch (e) {
      normalizedContext = { nota: "Contexto simplificado por seguridad técnica" };
    }
    // ------------------------------------------------------------

    const normalizedHistory = normalizeChatHistory(normalizedContext.historialChat);

    // --- INTELIGENCIA COMERCIAL: BÚSQUEDA WEB CONDICIONAL ---
    let webSearchResult = "";
    if (isCommercialEntitiesQuery(mensaje)) {
      try {
        webSearchResult = await searchCommercialWeb(mensaje);
      } catch (searchError) {
        console.warn("[chat-assistant] Error en búsqueda web comercial:", searchError);
      }
    }

    if (webSearchResult) {
      normalizedHistory.push({
        role: "user",
        content: `[RESULTADOS DE BÚSQUEDA WEB EN TIEMPO REAL - INTELIGENCIA COMERCIAL / ARMADORES / CONSIGNATARIOS]:\n${webSearchResult}`,
      });
      normalizedHistory.push({
        role: "assistant",
        content: "Información comercial web recopilada y verificada. Procedo a identificar al Commercial Operator, Chartering Desk o agentes correspondientes según las reglas comerciales.",
      });
    }

    const intent = classifyChatIntent(mensaje || "Analiza esta imagen", { context: normalizedContext });
    const finalInstruction = buildSystemInstruction(normalizedContext, normalizedHistory, intent);
    const action = intent === CHAT_INTENTS.SIMULATION
      ? buildCalculatorAutofillAction(mensaje || "", normalizedContext)
      : null;

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [{ googleSearch: {} }],
      systemInstruction: finalInstruction,
    });

    const chatHistory = buildGeminiHistory(normalizedHistory);
    const chat = model.startChat(chatHistory.length > 0 ? { history: chatHistory } : undefined);

    // --- CONSTRUCCIÓN MULTIMODAL DEL MENSAJE (TEXTO + IMAGEN/PDF OPCIONAL) ---
    const userParts = [];
    const textPrompt = (mensaje || "").trim() || (imagenData?.data ? "Analiza esta imagen y valida los cálculos o datos mostrados en pantalla:" : (multimodalParts.length > 0 ? "Analiza estos documentos adjuntos y extrae las partidas del proyecto:" : ""));
    if (textPrompt) {
      userParts.push({ text: textPrompt });
    }
    if (imagenData?.data && imagenData?.mimeType) {
      userParts.push({
        inlineData: {
          data: imagenData.data,
          mimeType: imagenData.mimeType,
        },
      });
    }
    if (multimodalParts.length > 0) {
      userParts.push(...multimodalParts);
    }
    // -------------------------------------------------------------------

    const messagePayload = userParts.length === 1 && typeof userParts[0].text === "string"
      ? userParts[0].text
      : userParts;

    let result = await chat.sendMessage(messagePayload);
    const functionCalls = result.response.functionCalls() || [];
    if (functionCalls.length > 0) {
      const functionResponseParts = await Promise.all(
        functionCalls.map(async (functionCall) => {
          let output = "";
          if (functionCall.name === "searchWeb") {
            const query = functionCall.args?.query || "";
            output = await executeWebSearch(query);
          } else {
            output = "Función no reconocida.";
          }
          return {
            functionResponse: {
              name: functionCall.name,
              response: { output },
            },
          };
        })
      );

      result = await chat.sendMessage(functionResponseParts);
    }

    const { responseText, groundingMetadata } = processGroundedResponse(result.response);
    let parsedAction = action;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*"action"\s*:\s*"IMPORT_PROJECT_ITEMS"[\s\S]*\}/);
      if (jsonMatch) {
        const extractedJson = JSON.parse(jsonMatch[0]);
        parsedAction = extractedJson;
      }
    } catch (e) {}

    return jsonResponse(200, {
      success: true,
      intent,
      respuesta: responseText,
      action: parsedAction,
      groundingMetadata: groundingMetadata || null,
    });

  } catch (error) {
    console.error("Error en Gemini API:", error);
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Error interno del servidor.",
    });
  }
};
