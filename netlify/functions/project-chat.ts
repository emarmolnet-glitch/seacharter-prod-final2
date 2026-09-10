import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { Buffer } from "node:buffer";

export const AGENTE_PROYECTOS_MODEL = "gemini-2.5-flash";

export const headers: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

export function formatProjectContext(body: any = {}): string {
  if (body?.projectContext) {
    return typeof body.projectContext === 'string'
      ? body.projectContext
      : JSON.stringify(body.projectContext);
  }
  const fallbackContext = {
    items: body?.items || [],
    financials: body?.financialBreakdown || body?.financials || {},
    stowage: body?.stowagePlan || body?.stowage || {}
  };
  return JSON.stringify(fallbackContext);
}

export function buildAgenteProyectosSystemInstruction(projectContext: any = '{}'): string {
  const pContext = typeof projectContext === 'string' ? projectContext : JSON.stringify(projectContext);
  return `Eres el Agente de Proyectos de SeaCharter Core PRO, impulsado por Gemini. Eres un consultor estratégico marítimo y un socio conversacional altamente inteligente.

REGLA CERO - SALUDOS Y MENSAJES CASUALES:
Si el usuario te saluda ("hola", "buenos días", "qué tal") o hace una pregunta informal, responde ÚNICAMENTE con un saludo natural, humano y cercano, abriendo la puerta a la conversación. ¡PROHIBIDO! No escupas desgloses financieros, costes ni datos del JSON a menos que el usuario te pida explícitamente números, cálculos o análisis específicos.

REGLAS DE COMPORTAMIENTO Y PERSONALIDAD:
1. LIBERTAD ESTRATÉGICA Y CONVERSACIONAL: Habla de tú a tú con el usuario. Tienes permiso absoluto para debatir, opinar, aconsejar sobre negociaciones con clientes, analizar tendencias macroeconómicas (ej. impacto del precio del combustible en fletes) o buscar cualquier dato en la web en tiempo real.
2. OPINIÓN CRÍTICA Y ASESORAMIENTO: Si el usuario te pregunta "¿qué opinas de este croquis?" o "¿debería informar al cliente de esta subida?", no te limites a repetir datos. Analiza la situación, cruza la información con la web si es necesario, y da tu recomendación profesional como un bróker senior.
3. TONO NATURAL: Responde de forma directa, analítica y fluida. Usa formato markdown para estructurar ideas complejas, manteniendo un tono de diálogo abierto y proactivo.

REGLA DE AUTOMATIZACIÓN DE INTERFAZ (OBLIGATORIA):
Si el usuario te pide añadir mercancía, dimensiones, pesos o actualizar rutas, DEBES incluir al final de tu respuesta un bloque de código JSON estándar que el sistema leerá. 

Ejemplo para añadir piezas a la Lista de Empaque:
\`\`\`json
{
  "action": "add_packing_list_item",
  "payload": {
    "category": "Mercancía General / Paletizada",
    "type": "Big Bags Cemento",
    "quantity": 6666,
    "length": 1.15,
    "width": 1.10,
    "height": 1.0,
    "unitWeight": 1500
  }
}
\`\`\`

ACCIONES DE CONTROL DE FORMULARIO DEL PROYECTO:
Si el usuario te da una orden para modificar campos del proyecto (como cantidad, puertos, ritmos de carga/descarga), además de responder de forma conversacional como consultor, debes incluir al final de tu respuesta un bloque JSON oculto con esta estructura exacta para que la interfaz pueda actualizarse automáticamente:
\`\`\`json-action
{
  "action": "update_form",
  "data": {
    "quantityMT": 5000,
    "portOfLoading": "Valencia",
    "portOfDischarge": "Houston",
    "loadingRate": 1200,
    "dischargeRate": 1000
  }
}
\`\`\`

CONTEXTO EN VIVO DEL PROYECTO (USO INTERNO):
Tienes acceso en tiempo real a los datos que el usuario está operando, pero consúltalos solo cuando te hagan una pregunta técnica o financiera:
- Para consultas financieras, márgenes o viabilidad, evalúa la sección 'financials'.
- Para opinar sobre la viabilidad física, estiba o riesgos, analiza la sección 'stowage.executiveJustification'.
- NUNCA expongas el JSON crudo en tu respuesta.

Contexto actual del proyecto: ${pContext}`;
}

export function extractStructuredAction(responseText: string): {
  action: string;
  payload: any;
  cleanedText: string;
} {
  let action = "none";
  let payload: any = {};
  let cleanedText = responseText;

  if (!responseText || typeof responseText !== 'string') {
    return { action, payload, cleanedText: "" };
  }

  // Robust regex to capture any JSON code block (```json, ```json-action, or ```)
  const jsonCodeBlockRegex = /```(?:json-action|json)?\s*(\{[\s\S]*?\})\s*```/i;
  const match = responseText.match(jsonCodeBlockRegex);

  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed === 'object') {
        action = parsed.action || "none";
        payload = parsed.payload !== undefined ? parsed.payload : (parsed.data !== undefined ? parsed.data : parsed);
        cleanedText = responseText.replace(match[0], '').trim();
        return { action, payload, cleanedText };
      }
    } catch (parseErr) {
      console.warn("[project-chat] Failed to parse JSON code block:", parseErr);
    }
  }

  // Fallback: search for unfenced JSON with action if no code fence matched
  const rawJsonRegex = /\{[\s\S]*?"action"\s*:\s*"([a-zA-Z0-9_-]+)"[\s\S]*?\}/i;
  const rawMatch = responseText.match(rawJsonRegex);
  if (rawMatch) {
    try {
      const parsed = JSON.parse(rawMatch[0].trim());
      if (parsed && typeof parsed === 'object') {
        action = parsed.action || "none";
        payload = parsed.payload !== undefined ? parsed.payload : (parsed.data !== undefined ? parsed.data : parsed);
        cleanedText = responseText.replace(rawMatch[0], '').trim();
        return { action, payload, cleanedText };
      }
    } catch {}
  }

  return { action, payload, cleanedText };
}

export function buildGeminiHistory(historyEntries: any[] = []): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  if (!Array.isArray(historyEntries)) return [];
  const valid: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  let expectedRole: 'user' | 'model' = "user";
  for (const entry of historyEntries) {
    const role = (entry?.role === "assistant" || entry?.role === "model" || entry?.sender === "agent") ? "model" : "user";
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

export function processGroundedResponse(response: any): { responseText: string; groundingMetadata: any } {
  let responseText = "";
  try {
    responseText = typeof response?.text === "function" ? response.text() : "";
  } catch {
    const parts = response?.candidates?.[0]?.content?.parts || [];
    responseText = parts
      .map((part: any) => part?.text || "")
      .filter(Boolean)
      .join("\n");
  }

  const candidate = response?.candidates?.[0];
  const groundingMetadata = candidate?.groundingMetadata;
  if (groundingMetadata?.groundingChunks?.length > 0) {
    const webSources = groundingMetadata.groundingChunks
      .map((chunk: any) => chunk?.web)
      .filter((web: any) => Boolean(web?.uri && web?.title));

    if (webSources.length > 0) {
      const seenUris = new Set<string>();
      const uniqueSources: Array<{ uri: string; title: string }> = [];
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

export function extractFileParts(body: any): Array<Part> {
  const parts: Array<Part> = [];
  if (!body || typeof body !== 'object') return parts;

  const rawCandidates: any[] = [];

  // Single file references
  const singleFile = body.fileBase64 || body.file || body.fileData || body.attachment || body.document || body.archivo;
  if (singleFile) {
    rawCandidates.push({
      data: singleFile,
      name: body.fileName || body.name || body.filename || '',
      mimeType: body.mimeType || body.type || body.fileType || ''
    });
  }

  // Array of files
  const fileArray = body.files || body.attachments || body.documents;
  if (Array.isArray(fileArray)) {
    for (const item of fileArray) {
      if (!item) continue;
      if (typeof item === 'string') {
        rawCandidates.push({ data: item, name: '', mimeType: '' });
      } else if (typeof item === 'object') {
        rawCandidates.push({
          data: item.data || item.fileBase64 || item.base64 || item.file || item.content,
          name: item.name || item.fileName || item.filename || '',
          mimeType: item.mimeType || item.type || item.fileType || ''
        });
      }
    }
  }

  for (const candidate of rawCandidates) {
    if (!candidate.data || typeof candidate.data !== 'string') continue;
    let cleanBase64 = candidate.data.trim();
    if (!cleanBase64) continue;

    let mimeType = candidate.mimeType || '';
    const fileName = candidate.name || '';

    // Data URI header detection (e.g., data:image/png;base64,...)
    if (cleanBase64.includes(';base64,')) {
      const splitIdx = cleanBase64.indexOf(';base64,');
      const header = cleanBase64.substring(0, splitIdx);
      const mimeMatch = header.match(/data:(.*?)$/);
      if (mimeMatch && mimeMatch[1]) {
        mimeType = mimeMatch[1].trim();
      }
      cleanBase64 = cleanBase64.substring(splitIdx + 8).trim();
    }

    // Default MIME type resolution if not provided
    if (!mimeType) {
      const lower = fileName.toLowerCase();
      if (lower.endsWith('.pdf')) mimeType = 'application/pdf';
      else if (lower.endsWith('.png')) mimeType = 'image/png';
      else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (lower.endsWith('.webp')) mimeType = 'image/webp';
      else if (lower.endsWith('.csv')) mimeType = 'text/csv';
      else if (lower.endsWith('.txt')) mimeType = 'text/plain';
      else if (lower.endsWith('.json')) mimeType = 'application/json';
      else mimeType = 'application/pdf';
    }

    // If it's a plain text/CSV file, pass as decoded text for direct reading
    if (mimeType.startsWith('text/') || mimeType.includes('csv') || mimeType.includes('json')) {
      try {
        const decoded = Buffer.from(cleanBase64, 'base64').toString('utf8');
        parts.push({
          text: `\n--- CONTENIDO ARCHIVO ADJUNTO (${fileName || 'documento'}) [${mimeType}] ---\n${decoded}\n--- FIN ARCHIVO ADJUNTO ---\n`
        });
        continue;
      } catch {
        // Fall back to inlineData if decode fails
      }
    }

    // Standard multimodal inline data part
    parts.push({
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType
      }
    });

    if (fileName) {
      parts.push({
        text: `[Archivo adjunto del usuario: ${fileName} (${mimeType})]`
      });
    }
  }

  return parts;
}

export async function handler(eventOrRequest: any, context?: any): Promise<Response> {
  const request: Request = eventOrRequest?.method
    ? eventOrRequest
    : new Request(eventOrRequest?.url || 'http://localhost/api/project-chat', eventOrRequest);

  if (request.method === 'OPTIONS') {
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
  }

  try {
    let body: any = {};
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        body.message = formData.get('message') || formData.get('mensaje') || formData.get('text') || '';
        body.projectContext = formData.get('projectContext') || formData.get('context') || '';
        const rawHistory = formData.get('history') || formData.get('historial');
        if (typeof rawHistory === 'string') {
          try { body.history = JSON.parse(rawHistory); } catch { body.history = []; }
        }
        const uploadedFile = formData.get('file') || formData.get('attachment') || formData.get('document');
        if (uploadedFile && typeof (uploadedFile as any).arrayBuffer === 'function') {
          const fileObj = uploadedFile as File;
          const ab = await fileObj.arrayBuffer();
          body.fileBase64 = Buffer.from(ab).toString('base64');
          body.fileName = fileObj.name;
          body.mimeType = fileObj.type || 'application/pdf';
        }
      } catch (formErr) {
        console.warn('[project-chat] Error reading formData:', formErr);
      }
    } else {
      try {
        body = await request.json();
      } catch {
        body = {};
      }
    }

    // Route-guard: only blocks if an unrelated module is explicitly indicated and not project mode
    const activeModule = body.modulo || body.module || body.activeModule;
    if (activeModule && activeModule !== 'proyectos' && !body.isProjectMode) {
      return new Response(JSON.stringify({
        success: false,
        reply: "El Agente de Proyectos solo opera dentro del módulo de proyectos.",
        action: "none",
        payload: {}
      }), { status: 403, headers });
    }

    const apiKey = (typeof Netlify !== 'undefined' && (
      Netlify.env?.get?.('GEMINI_API_KEY') ||
      Netlify.env?.get?.('GOOGLE_API_KEY') ||
      Netlify.env?.get?.('GOOGLE_GENAI_API_KEY') ||
      Netlify.env?.get?.('NETLIFY_AI_GATEWAY_KEY')
    ))
      || process.env.GEMINI_API_KEY
      || process.env.GOOGLE_API_KEY
      || process.env.GOOGLE_GENAI_API_KEY
      || process.env.NETLIFY_AI_GATEWAY_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({
        success: false,
        reply: "GEMINI_API_KEY no configurada en el servidor.",
        error: "GEMINI_API_KEY no configurada.",
        action: "error",
        payload: {}
      }), { status: 500, headers });
    }

    const baseUrl = (typeof Netlify !== 'undefined' && (
      Netlify.env?.get?.('GOOGLE_GEMINI_BASE_URL') ||
      Netlify.env?.get?.('NETLIFY_AI_GATEWAY_BASE_URL')
    ))
      || process.env.GOOGLE_GEMINI_BASE_URL
      || process.env.NETLIFY_AI_GATEWAY_BASE_URL;

    const requestOptions = baseUrl ? { baseUrl } : undefined;

    const projectContext = formatProjectContext(body);
    const systemInstruction = body.systemInstruction || buildAgenteProyectosSystemInstruction(projectContext);

    // Extract any file parts (if empty/missing, text order runs with complete normality)
    const fileParts = extractFileParts(body);

    const rawMessage = body.message || body.mensaje || body.UserContext || body.text || body.prompt || body.order || "";
    const cleanUserText = String(rawMessage).trim();

    // Default message when user attaches file without typing a message
    const finalPromptText = cleanUserText
      || (fileParts.length > 0
        ? "Por favor analiza el archivo adjunto en relación con el estado y requerimientos del proyecto marítimo actual."
        : "Hola");

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: AGENTE_PROYECTOS_MODEL,
      tools: [{ googleSearch: {} }],
      systemInstruction: systemInstruction
    }, requestOptions);

    const rawHistory = body.history || body.historial || [];
    const chatHistory = buildGeminiHistory(rawHistory);
    const chat = model.startChat(chatHistory.length > 0 ? { history: chatHistory } : undefined);

    let partsToSend: string | Array<string | Part>;
    if (fileParts.length > 0) {
      partsToSend = [...fileParts, { text: finalPromptText }];
    } else {
      partsToSend = finalPromptText;
    }

    const result = await chat.sendMessage(partsToSend);
    let { responseText, groundingMetadata } = processGroundedResponse(result.response);

    // Extract structured JSON action if emitted by model, and clean conversational text
    const { action, payload, cleanedText } = extractStructuredAction(responseText);
    const finalReply = cleanedText || (action === 'add_packing_list_item' ? 'He añadido las piezas a la Lista de Empaque.' : (action === 'update_form' ? 'He actualizado los datos del proyecto.' : responseText));

    return new Response(JSON.stringify({
      success: true,
      reply: finalReply,
      text: finalReply,
      respuesta: finalReply,
      action: action,
      payload: payload,
      groundingMetadata: groundingMetadata || null,
      intent: action === 'add_packing_list_item'
        ? 'ADD_PACKING_LIST_ITEM'
        : (action === 'update_form' ? 'UPDATE_PROJECT_FORM' : (action !== 'none' ? action.toUpperCase() : 'PROJECT_CONSULTANT'))
    }), { status: 200, headers });

  } catch (error) {
    console.error("[project-chat] Error in serverless execution:", error);
    return new Response(JSON.stringify({
      success: false,
      reply: "El Agente de Proyectos no está disponible temporalmente.",
      error: error instanceof Error ? error.message : "Error interno del servidor.",
      action: "error",
      payload: {}
    }), { status: 503, headers });
  }
}

export default handler;
