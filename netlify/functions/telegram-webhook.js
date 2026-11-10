/**
 * netlify/functions/telegram-webhook.js
 * 
 * Función serverless independiente para la integración de bots de Telegram
 * con el motor cognitivo MADRE y las matrices de cálculo de las 13 hijas.
 * 
 * Principios Arquitectónicos:
 * - 100% Serverless y Sin Dependencias Persistentes.
 * - Soporte Multimodal: Procesa mensajes de texto y notas de voz.
 * - Ecosistema 100% Google Gemini: Usa gemini-2.5-flash para transcripción y síntesis de voz (sin librerías de terceros).
 * - Enrutamiento a SeaCharter: Evaluaciones directas contra las matrices de fletamento y Neon DB.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { requestVerdict } from "./madre-chat.js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Telegram-Bot-Api-Secret-Token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const config = {
  path: ["/api/telegram", "/api/telegram-webhook"],
  timeout: 26,
};

export const OFFICIAL_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "9017174373:AAGD6grZr6D0Ph2v3FlVrwMNPLpDgMBbRLk";
const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_TIMEOUT_MS = 20000;
export const DEFAULT_MADRE_TIMEOUT_MS = 15000;
export const MADRE_EMERGENCY_REPLY =
  "Soy MADRE. He recibido tu consulta operativa pero mis canales centrales están experimentando una latencia momentánea. Por favor, reitera tu mensaje en unos instantes.";

/**
 * Normaliza y formatea texto para las convenciones tipográficas de Markdown de Telegram.
 */
export function formatForTelegram(rawText) {
  if (!rawText || typeof rawText !== "string") return "";

  let text = rawText;
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
  text = text.replace(/\*\*(.*?)\*\*/g, "*$1*");
  text = text.replace(/__(.*?)__/g, "_$1_");
  text = text.replace(/<[^>]+>/g, "");

  if (text.length > 4000) {
    text = text.slice(0, 3950) + "\n\n[..._Respuesta resumida por longitud máxima de Telegram_]";
  }

  return text.trim();
}

/**
 * Extrae datos normalizados de un Update entrante de Telegram.
 */
export function extractTelegramMessage(update) {
  if (!update || typeof update !== "object") return null;

  const msg = update.message || update.edited_message || update.channel_post;
  if (!msg || !msg.chat) return null;

  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const from = msg.from || {};
  const senderName = [from.first_name, from.last_name].filter(Boolean).join(" ") || msg.chat.title || "Usuario Telegram";
  const username = from.username || "";

  const rawText = msg.text || msg.caption || "";
  const voice = msg.voice;
  const audio = msg.audio;
  const isVoice = Boolean(voice || audio);
  const fileId = voice?.file_id || audio?.file_id || null;
  const mimeType = voice?.mime_type || audio?.mime_type || (voice ? "audio/ogg" : "audio/mpeg");

  return {
    chatId,
    messageId,
    userText: rawText.trim(),
    isVoice,
    fileId,
    mimeType,
    senderName,
    username,
  };
}

/**
 * Descarga un archivo multimedia de Telegram a través de su API oficial (getFile).
 */
export async function downloadTelegramFile(fileId, botToken = OFFICIAL_BOT_TOKEN, options = {}) {
  const token = botToken !== undefined ? botToken : OFFICIAL_BOT_TOKEN;
  if (!fileId || !token) return null;

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const getFileUrl = `${TELEGRAM_API_BASE}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`;
    const metaRes = await fetch(getFileUrl, { signal: controller.signal });

    if (!metaRes.ok) return null;

    const metaData = await metaRes.json();
    if (!metaData.ok || !metaData.result?.file_path) return null;

    const downloadUrl = `${TELEGRAM_API_BASE}/file/bot${token}/${metaData.result.file_path}`;
    const fileRes = await fetch(downloadUrl, { signal: controller.signal });

    if (!fileRes.ok) return null;

    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[telegram-webhook] Excepción descargando archivo:", err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envía una acción de chat (ej: typing o record_voice) para dar feedback al usuario.
 */
export async function sendTelegramChatAction(botToken = OFFICIAL_BOT_TOKEN, chatId, action = "typing") {
  const token = botToken !== undefined ? botToken : OFFICIAL_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const url = `${TELEGRAM_API_BASE}/bot${token}/sendChatAction`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Envía un mensaje de texto de vuelta al chat de Telegram mediante sendMessage.
 */
export async function sendTelegramMessage(botToken = OFFICIAL_BOT_TOKEN, chatId, text, options = {}) {
  const token = botToken !== undefined ? botToken : OFFICIAL_BOT_TOKEN;
  if (!chatId || !text) return { ok: false, error: "Parámetros obligatorios" };

  if (!token) {
    return { ok: true, simulated: true, chat_id: chatId, text, timestamp: new Date().toISOString() };
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const replyTo = options.replyToMessageId || undefined;
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: options.parseMode || "Markdown",
      ...(replyTo ? { reply_to_message_id: replyTo } : {}),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json();
    if (data.ok) return data;

    const description = data.description || "";
    if (description.includes("can't parse entities") || description.includes("parse")) {
      const fallbackRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.replace(/[*_`]/g, ""),
          ...(replyTo ? { reply_to_message_id: replyTo } : {}),
        }),
      });
      return await fallbackRes.json();
    }
    return data;
  } catch (err) {
    return { ok: false, error: err?.message || "Error de red" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envía una nota de voz o archivo de audio a un chat de Telegram mediante sendVoice.
 */
export async function sendTelegramVoice(botToken = OFFICIAL_BOT_TOKEN, chatId, audioBuffer, options = {}) {
  const token = botToken !== undefined ? botToken : OFFICIAL_BOT_TOKEN;

  if (!chatId || !audioBuffer) return { ok: false, error: "Parámetros obligatorios" };

  const buf = Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(audioBuffer);
  if (buf.length === 0) return { ok: false, error: "Buffer vacío" };

  if (!token) {
    return { ok: true, simulated: true, chat_id: chatId, voice: true, bytes: buf.length, timestamp: new Date().toISOString() };
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const replyTo = options.replyToMessageId || undefined;
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendVoice`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const filename = options.filename || (options.mimeType === "audio/mpeg" ? "voice.mp3" : "voice.ogg");
  const mimeType = options.mimeType || (filename.endsWith(".mp3") ? "audio/mpeg" : "audio/ogg");

  try {
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("voice", new Blob([buf], { type: mimeType }), filename);

    if (options.caption) {
      formData.append("caption", options.caption.slice(0, 1024));
      if (options.parseMode) formData.append("parse_mode", options.parseMode);
    }
    if (replyTo) formData.append("reply_to_message_id", String(replyTo));

    const response = await fetch(url, { method: "POST", body: formData, signal: controller.signal });
    const data = await response.json();
    if (data.ok) return data;

    const description = data.description || "";
    if (options.caption && (description.includes("can't parse entities") || description.includes("parse"))) {
      const fallbackFormData = new FormData();
      fallbackFormData.append("chat_id", String(chatId));
      fallbackFormData.append("voice", new Blob([buf], { type: mimeType }), filename);
      fallbackFormData.append("caption", options.caption.replace(/[*_`]/g, "").slice(0, 1024));
      if (replyTo) fallbackFormData.append("reply_to_message_id", String(replyTo));

      const fallbackRes = await fetch(url, { method: "POST", body: fallbackFormData, signal: controller.signal });
      return await fallbackRes.json();
    }
    return data;
  } catch (err) {
    return { ok: false, error: err?.message || "Error de red" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Transcribe un archivo de audio o nota de voz utilizando 100% Google Gemini (gemini-2.5-flash).
 */
export async function transcribeAudio(audioBuffer, mimeType = "audio/ogg", options = {}) {
  if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    return { success: false, text: "", error: "Buffer de audio vacío o inválido." };
  }

  const cleanMime = (mimeType || "audio/ogg").split(";")[0].trim();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.NETLIFY_AI_GATEWAY_KEY || options.geminiApiKey || options.apiKey;

  if (!geminiKey) {
    return { success: false, text: "", error: "No hay clave de Gemini configurada." };
  }

  try {
    const genAI = options.genAI || new GoogleGenerativeAI(geminiKey);
    const modelName = options.model || options.geminiModel || "gemini-2.5-flash";
    const systemInstruction =
      options.systemInstruction ||
      "Eres el transcriptor neuronal oficial del sistema logístico MADRE. Transcribe el siguiente mensaje de voz de forma íntegra y fiel en español. Devuelve únicamente el texto transcrito sin prefacios, explicaciones ni comentarios adicionales.";
    
    const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
    const result = await model.generateContent([
      { inlineData: { mimeType: cleanMime, data: audioBuffer.toString("base64") } },
    ]);

    const text = result?.response?.text()?.trim();
    if (text) {
      return { success: true, text, engine: modelName };
    }
  } catch (geminiErr) {
    console.warn("[telegram-webhook] Transcripción Gemini falló:", geminiErr?.message || geminiErr);
  }

  return {
    success: false,
    text: "Nota de voz recibida (no se pudo transcribir con precisión el audio)",
    error: "El procesamiento de voz falló.",
  };
}

/**
 * Sintetiza un texto en un buffer de audio nativamente con Google Gemini (gemini-2.5-flash).
 */
export async function synthesizeSpeech(text, options = {}) {
  if (!text || typeof text !== "string" || !text.trim()) {
    return { success: false, audioBuffer: null, error: "Texto vacío." };
  }

  if (options.mockAudioBuffer && Buffer.isBuffer(options.mockAudioBuffer)) {
    const fmt = options.format || "opus";
    return {
      success: true,
      audioBuffer: options.mockAudioBuffer,
      format: fmt,
      mimeType: fmt === "mp3" ? "audio/mpeg" : fmt === "wav" ? "audio/wav" : "audio/ogg",
      engine: "mock-tts",
      voice: options.voice || "Aoede",
    };
  }

  const geminiKey = options.geminiApiKey || process.env.GEMINI_API_KEY || process.env.NETLIFY_AI_GATEWAY_KEY;
  if (!geminiKey) {
    return { success: false, audioBuffer: null, error: "No hay clave de Gemini configurada." };
  }

  const cleanText = text.replace(/[*_`#]/g, "").replace(/\[\.\.\..*?\]/g, "").slice(0, 4000).trim();

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const geminiVoice = options.voice || process.env.TELEGRAM_TTS_VOICE || "Aoede"; 
    const model = genAI.getGenerativeModel({
      model: options.geminiModel || options.model || "gemini-2.5-flash",
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice } } },
      },
    });

    const result = await model.generateContent(cleanText);
    const candidates = result?.response?.candidates || [];
    const parts = candidates[0]?.content?.parts || [];
    const audioPart = parts.find((p) => p.inlineData && p.inlineData.mimeType?.startsWith("audio/"));

    if (audioPart?.inlineData?.data) {
      const audioBuffer = Buffer.from(audioPart.inlineData.data, "base64");
      const mimeType = audioPart.inlineData.mimeType || "audio/wav";
      const format = mimeType.includes("wav") ? "wav" : mimeType.includes("mp3") ? "mp3" : "opus";

      return {
        success: true,
        audioBuffer,
        format,
        mimeType,
        engine: options.geminiModel || options.model || "gemini-2.5-flash",
        voice: geminiVoice,
      };
    }
  } catch (err) {
    console.warn("[telegram-webhook] Error en síntesis de voz Gemini:", err?.message || err);
  }

  return { success: false, audioBuffer: null, error: "Fallo en síntesis nativa de Gemini." };
}

export { synthesizeSpeech as synthesizeVoice, synthesizeSpeech as textToSpeech };

/**
 * Reconstruye el payload JSON inyectando el contexto de "sea_charter" 
 * para despertar las matrices operativas.
 */
export function buildDataBridgePayload(userText, metadata = {}) {
  const query = (userText || "").trim();
  const rawChatId = metadata?.chatId ?? metadata?.chat_id ?? "TELEGRAM-USER";
  const chatId = String(rawChatId);
  const senderName = metadata?.senderName || metadata?.sender_name || "Usuario Telegram";
  const username = metadata?.username || "";
  const refMadre = metadata?.referenciaMadre || metadata?.ref || `TG-${chatId}`;

  const tenantId = metadata?.tenantId || metadata?.tenant_id || metadata?.tenant || "admin";
  const empresa = metadata?.empresa || "administracion";
  const rol = metadata?.rol || metadata?.role || "admin";
  const vistaActiva = metadata?.vista_activa || metadata?.vistaActiva || "Panel Marítimo";

  const contextoUI = {
    vista_activa: vistaActiva,
    vistaActiva: vistaActiva,
    current_module: "sea_charter",
    currentModule: "sea_charter",
    modulo: "sea_charter",
    elementos_visibles: [],
    estado_globo: null,
    alertas_campos_vacios: [],
    tenant_id: tenantId,
    tenant: tenantId,
    empresa: empresa,
    rol: rol,
    user_id: metadata?.userId || metadata?.user_id || `tg-${chatId}`,
    usuario: metadata?.usuario || senderName,
    canal: "telegram",
    chat_id: chatId,
    sender_name: senderName,
    username: username,
    tipo_entrada: metadata?.type || metadata?.tipo_entrada || "text",
    timestamp: new Date().toISOString(),
    ...(metadata?.contexto_ui || metadata?.contextoUI || {}),
  };

  return {
    referenciaMadre: refMadre,
    sessionId: refMadre,
    session_id: refMadre,
    origen: "Telegram SeaCharter",
    current_module: "sea_charter",
    currentModule: "sea_charter",
    modulo: "sea_charter",
    mensajeUsuario: query,
    mensaje: query,
    prompt: query,
    tenant_id: tenantId,
    tenant: tenantId,
    empresa: empresa,
    rol: rol,
    user_id: metadata?.userId || metadata?.user_id || `tg-${chatId}`,
    usuario: metadata?.usuario || senderName,
    history: Array.isArray(metadata?.history) ? metadata.history : Array.isArray(metadata?.historial) ? metadata.historial : [],
    contexto_ui: contextoUI,
  };
}

export { buildDataBridgePayload as construirPayloadDataBridge };

/**
 * Extracción unificada de la respuesta devuelta por madre-chat.js.
 */
export function extractMadreReply(resultado) {
  if (!resultado) return "";

  if (typeof resultado === "string") {
    const trimmed = resultado.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractMadreReply(parsed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  if (typeof resultado !== "object") return String(resultado);

  if (typeof resultado.reply === "string" && resultado.reply.trim()) return resultado.reply.trim();
  if (typeof resultado.respuesta === "string" && resultado.respuesta.trim()) return resultado.respuesta.trim();
  if (typeof resultado.mensaje_voz === "string" && resultado.mensaje_voz.trim()) return resultado.mensaje_voz.trim();
  if (typeof resultado.message === "string" && resultado.message.trim()) return resultado.message.trim();
  if (typeof resultado.text === "string" && resultado.text.trim()) return resultado.text.trim();
  if (typeof resultado.texto === "string" && resultado.texto.trim()) return resultado.texto.trim();
  if (typeof resultado.response === "string" && resultado.response.trim()) return resultado.response.trim();
  if (typeof resultado.resultado === "string" && resultado.resultado.trim()) return resultado.resultado.trim();
  if (typeof resultado.mensaje === "string" && resultado.mensaje.trim()) return resultado.mensaje.trim();

  if (resultado.data) {
    if (typeof resultado.data === "object") {
      const extracted = extractMadreReply(resultado.data);
      if (extracted) return extracted;
    } else if (typeof resultado.data === "string" && resultado.data.trim()) return resultado.data.trim();
  }

  if (resultado.datos) {
    if (typeof resultado.datos === "object") {
      const extracted = extractMadreReply(resultado.datos);
      if (extracted) return extracted;
    } else if (typeof resultado.datos === "string" && resultado.datos.trim()) return resultado.datos.trim();
  }

  if (resultado.accion_ui === "navegar" && resultado.destino) return `Abriendo la sección ${resultado.destino}.`;
  if (resultado.accion_ui === "localizar_en_globo") return resultado.mensaje_voz || `Localizando buque ${resultado.nombre || ""} en coordenadas (${resultado.lat}, ${resultado.lng}).`;
  if (typeof resultado.reporte_estrategico === "string" && resultado.reporte_estrategico.trim()) return resultado.reporte_estrategico.trim();
  if (typeof resultado.error === "string" && resultado.error.trim()) return resultado.error.trim();

  return "";
}

export { extractMadreReply as extraerRespuestaMadre };

/**
 * Consulta de solo lectura al motor cognitivo de MADRE.
 */
export async function queryMadreEngineFromTelegram(userText, metadata = {}, options = {}) {
  try {
    const query = (userText || "").trim();
    if (!query) {
      return { reply: "Hola. Soy MADRE, el centro operativo logístico de SeaCharter. ¿En qué fletamento puedo asistirte hoy?" };
    }

    if (options?.mockMadreReply || metadata?.mockMadreReply) {
      return { reply: options?.mockMadreReply || metadata?.mockMadreReply, simulated: true };
    }

    const chatId = metadata?.chatId || metadata?.chat_id || "TELEGRAM-USER";
    const senderName = metadata?.senderName || metadata?.sender_name || "Usuario Telegram";
    const timeoutMs = Number(options?.timeoutMs || metadata?.timeoutMs) || DEFAULT_MADRE_TIMEOUT_MS;

    try {
      const madrePayload = buildDataBridgePayload(query, { ...metadata, chatId, senderName });

      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error(`Timeout de ${timeoutMs}ms excedido esperando respuesta de procesarChatMadre`);
          timeoutErr.name = "MadreTimeoutError";
          reject(timeoutErr);
        }, timeoutMs);
      });

      let resultado;
      try {
        resultado = await Promise.race([requestVerdict(madrePayload), timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }

      const extractedReply = extractMadreReply(resultado);
      return {
        reply: extractedReply || "He recibido tu consulta operativa. El sistema central ha procesado tu solicitud.",
        raw: resultado,
      };
    } catch (directErr) {
      console.error(`[telegram-webhook] Error al invocar procesarChatMadre:`, directErr);

      if (directErr?.name !== "MadreTimeoutError") {
        try {
          const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://127.0.0.1:8889";
          const apiUrl = `${baseUrl}/.netlify/functions/madre-chat`;
          const httpController = new AbortController();
          const httpTimer = setTimeout(() => httpController.abort(), 3000);

          try {
            const fallbackPayload = buildDataBridgePayload(query, { ...metadata, chatId, senderName });
            const httpRes = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(fallbackPayload),
              signal: httpController.signal,
            });

            if (httpRes.ok) {
              const httpData = await httpRes.json();
              const httpReply = extractMadreReply(httpData);
              if (httpReply) return { reply: httpReply, raw: httpData };
            }
          } finally {
            clearTimeout(httpTimer);
          }
        } catch (httpErr) {
          console.error("[telegram-webhook] Fallback HTTP también falló:", httpErr);
        }
      }

      return { reply: MADRE_EMERGENCY_REPLY, error: directErr?.message, emergency: true };
    }
  } catch (fatalErr) {
    console.error("[telegram-webhook] Excepción no controlada:", fatalErr);
    return { reply: MADRE_EMERGENCY_REPLY, error: fatalErr?.message, emergency: true };
  }
}

export { queryMadreEngineFromTelegram as queryMadreEngine };

/**
 * Procesa un Update completo recibido por el Webhook de Telegram.
 */
export async function processTelegramUpdate(update, options = {}) {
  const botToken = options.botToken !== undefined ? options.botToken : (process.env.TELEGRAM_BOT_TOKEN || OFFICIAL_BOT_TOKEN);
  const parsed = extractTelegramMessage(update);

  if (!parsed) return { ignored: true, reason: "sin_mensaje_valido" };

  const { chatId, messageId, senderName, username, isVoice, fileId, mimeType } = parsed;
  let userText = parsed.userText;
  let tipoEntrada = "text";

  sendTelegramChatAction(botToken, chatId, isVoice ? "record_voice" : "typing").catch(() => {});

  if (userText === "/start" || userText === "/help") {
    const welcome = `👋 *Bienvenido al canal oficial de MADRE en Telegram*\n\nSoy MADRE, la inteligencia central de *SeaCharter Core PRO*.\n\n💬 *¿Qué fletamento u operación deseas consultar hoy?*`;
    await sendTelegramMessage(botToken, chatId, welcome, { replyToMessageId: messageId });
    return { success: true, command: userText, reply: welcome };
  }

  if (userText === "/status" || userText === "/ping") {
    const statusMsg = `⚓ *MADRE Operational Status*\n- *Plataforma:* Netlify Serverless\n- *Motor:* SeaCharter\n- *IA:* 100% Gemini 2.5 Flash\n- *Tiempo:* ${new Date().toISOString()}`;
    await sendTelegramMessage(botToken, chatId, statusMsg, { replyToMessageId: messageId });
    return { success: true, command: userText, reply: statusMsg };
  }

  if (isVoice && fileId) {
    const audioBuffer = await downloadTelegramFile(fileId, botToken);
    if (audioBuffer && audioBuffer.length > 0) {
      const transResult = await transcribeAudio(audioBuffer, mimeType);
      if (transResult?.success && transResult?.text) {
        userText = transResult.text;
        tipoEntrada = "voice";
      } else {
        await sendTelegramMessage(botToken, chatId, "🎤 *MADRE:* No fue posible transcribir el audio. Por favor, escribe tu consulta.", { replyToMessageId: messageId });
        return { success: false, reason: "transcriptionFailed" };
      }
    } else {
      await sendTelegramMessage(botToken, chatId, "🎤 *MADRE:* No se pudo descargar la nota de voz.", { replyToMessageId: messageId });
      return { success: false, reason: "downloadFailed" };
    }
  }

  if (!userText || !userText.trim()) return { ignored: true, reason: "mensaje_vacio" };

  let rawReply = options.mockReply;
  if (!rawReply) {
    const madreResult = await queryMadreEngineFromTelegram(userText, { chatId, senderName, username, type: tipoEntrada }, options);
    rawReply = madreResult?.reply || "Soy MADRE. Mis canales están experimentando un retardo momentáneo.";
  }

  const formattedReply = formatForTelegram(rawReply);
  let voiceResult = null;
  let voiceSent = false;
  const enableVoice = options.enableVoice !== false;

  if (enableVoice) {
    try {
      const ttsResult = await synthesizeSpeech(rawReply, { format: options.audioFormat || "opus" });
      if (ttsResult?.success && ttsResult?.audioBuffer) {
        sendTelegramChatAction(botToken, chatId, "record_voice").catch(() => {});
        voiceResult = await sendTelegramVoice(botToken, chatId, ttsResult.audioBuffer, {
          replyToMessageId: messageId,
          mimeType: ttsResult.mimeType,
          filename: ttsResult.format === "mp3" ? "madre_voice.mp3" : "madre_voice.ogg",
        });
        if (voiceResult?.ok) voiceSent = true;
      }
    } catch (ttsErr) {
      console.warn("[telegram-webhook] Excepción en voz:", ttsErr);
    }
  }

  let sendResult = null;
  if (options.sendTextMessage !== false || !voiceSent) {
    sendResult = await sendTelegramMessage(botToken, chatId, formattedReply, { replyToMessageId: messageId });
  }

  return { success: true, chatId, userText, tipoEntrada, reply: formattedReply, voiceSent, voiceResponse: voiceResult, telegramResponse: sendResult };
}

/**
 * Handler principal compatible con Netlify Functions v2.
 */
export async function handler(req, context = {}) {
  const isRequestInstance = typeof Request !== "undefined" && req instanceof Request;

  if (req?.method === "OPTIONS" || (isRequestInstance && req.method === "OPTIONS")) {
    if (isRequestInstance) return new Response(null, { status: 204, headers: corsHeaders });
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  const method = isRequestInstance ? req.method : req?.httpMethod || req?.method || "GET";

  if (method === "GET") {
    const healthPayload = { service: "MADRE Telegram Bot (100% Gemini)", status: "online" };
    if (isRequestInstance) return new Response(JSON.stringify(healthPayload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify(healthPayload) };
  }

  if (method === "POST") {
    try {
      let body = {};
      if (isRequestInstance) {
        try { body = await req.json(); } catch { body = {}; }
      } else if (typeof req?.body === "string") {
        try { body = JSON.parse(req.body); } catch { body = {}; }
      } else if (req?.body && typeof req.body === "object") {
        body = req.body;
      } else {
        body = req;
      }

      const result = await processTelegramUpdate(body);
      const responsePayload = { ok: true, status: "processed", result };

      if (isRequestInstance) return new Response(JSON.stringify(responsePayload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify(responsePayload) };
    } catch (err) {
      console.error("[telegram-webhook] Error procesando webhook POST:", err);
      const errorPayload = { ok: false, error: "Error interno" };
      if (isRequestInstance) return new Response(JSON.stringify(errorPayload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify(errorPayload) };
    }
  }

  const notAllowed = { error: "Método no permitido" };
  if (isRequestInstance) return new Response(JSON.stringify(notAllowed), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return { statusCode: 405, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify(notAllowed) };
}

export default handler;
