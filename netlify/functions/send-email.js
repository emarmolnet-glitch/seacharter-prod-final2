const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM_ADDRESS = "SeaCharter Core PRO <no-reply@seacharter.app>";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_SUBJECT_CHARS = 500;
const MAX_BODY_CHARS = 100_000;
const MAX_RECIPIENTS = 20;
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readField(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length > 0) return value.join(", ");
  }
  return "";
}

function normalizeRecipients(rawValue) {
  return String(rawValue || "")
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getSenderAddress() {
  return String(process.env.RESEND_FROM_EMAIL || "").trim() || DEFAULT_FROM_ADDRESS;
}

function extractResendError(payload, fallback) {
  if (payload && typeof payload === "object") {
    const message = payload.message || payload.error || payload.name;
    if (message) return String(message);
  }
  return fallback;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Método no permitido. Usa POST." }, 405);
  }

  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    console.error("[send-email] RESEND_API_KEY no está configurada en el entorno.");
    return jsonResponse({
      ok: false,
      error: "La pasarela de correo no está configurada. Falta la credencial del proveedor de envío.",
    }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "El cuerpo de la petición debe ser JSON válido." }, 400);
  }
  if (!payload || typeof payload !== "object") {
    return jsonResponse({ ok: false, error: "El cuerpo de la petición debe ser un objeto JSON." }, 400);
  }

  const recipients = normalizeRecipients(readField(payload, ["to", "email_to", "recipient", "destinatario"]));
  const subject = readField(payload, ["subject", "email_subject", "asunto"]);
  const body = readField(payload, ["body", "email_body", "text", "message", "cuerpo"]);
  const replyTo = readField(payload, ["replyTo", "reply_to", "email_reply_to"]);
  const ccRecipients = normalizeRecipients(readField(payload, ["cc", "email_cc"]));

  if (recipients.length === 0) return jsonResponse({ ok: false, error: "Falta el destinatario del correo." }, 400);
  if (recipients.length > MAX_RECIPIENTS) {
    return jsonResponse({ ok: false, error: `Máximo ${MAX_RECIPIENTS} destinatarios por envío.` }, 400);
  }
  if (!subject) return jsonResponse({ ok: false, error: "Falta el asunto del correo." }, 400);
  if (!body) return jsonResponse({ ok: false, error: "El cuerpo del correo está vacío." }, 400);
  if (subject.length > MAX_SUBJECT_CHARS) {
    return jsonResponse({ ok: false, error: "El asunto supera la longitud máxima permitida." }, 400);
  }
  if (body.length > MAX_BODY_CHARS) {
    return jsonResponse({ ok: false, error: "El cuerpo del correo supera la longitud máxima permitida." }, 413);
  }

  const invalidAddress = [...recipients, ...ccRecipients, ...(replyTo ? [replyTo] : [])]
    .find((address) => !EMAIL_PATTERN.test(address));
  if (invalidAddress) {
    return jsonResponse({ ok: false, error: `Dirección de correo no válida: ${invalidAddress}` }, 400);
  }

  const emailRequest = {
    from: getSenderAddress(),
    to: recipients,
    subject,
    text: body,
    ...(ccRecipients.length > 0 ? { cc: ccRecipients } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  try {
    const providerResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(emailRequest),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const providerPayload = await providerResponse.json().catch(() => null);

    if (!providerResponse.ok) {
      const providerError = extractResendError(
        providerPayload,
        `El proveedor de correo respondió con estado ${providerResponse.status}.`,
      );
      console.error("[send-email] El proveedor rechazó el envío.", {
        status: providerResponse.status,
        error: providerError,
      });
      return jsonResponse({
        ok: false,
        error: providerError,
      }, providerResponse.status === 422 || providerResponse.status === 400 ? 422 : 502);
    }

    return jsonResponse({
      ok: true,
      id: providerPayload?.id || null,
      to: recipients,
      subject,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("[send-email] No se pudo despachar el correo.", error);
    return jsonResponse({
      ok: false,
      error: timedOut
        ? "El proveedor de correo tardó demasiado en responder. Inténtalo de nuevo."
        : "No se pudo enviar el correo en este momento.",
    }, timedOut ? 504 : 502);
  }
}
