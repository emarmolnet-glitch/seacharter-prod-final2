import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, x-requested-with",
};

const jsonHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
  ...corsHeaders,
};

function cleanKey(value: string | null): string {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 200);
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const rawReference = url.searchParams.get("reference") || url.searchParams.get("ref") || "";

  if (req.method === "POST") {
    let blobKey = cleanKey(rawReference);
    let pdfBuffer: ArrayBuffer | null = null;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const payload = await req.json().catch(() => null);
      if (payload) {
        if (!blobKey && (payload.reference || payload.ref)) {
          blobKey = cleanKey(payload.reference || payload.ref);
        }
        const b64 = payload.base64 || payload.data || payload.pdfBase64;
        if (b64 && typeof b64 === "string") {
          const cleanB64 = b64.includes(",") ? b64.split(",")[1] : b64;
          const binaryString = atob(cleanB64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          pdfBuffer = bytes.buffer;
        }
      }
    } else {
      pdfBuffer = await req.arrayBuffer().catch(() => null);
    }

    if (!blobKey) {
      blobKey = `doc_${Date.now()}`;
    }

    if (!pdfBuffer || pdfBuffer.byteLength === 0) {
      console.warn("[pdf] POST recibido con payload vacío para referencia:", blobKey);
      return new Response(JSON.stringify({
        success: true,
        reference: blobKey,
        warning: "Empty payload received",
      }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    try {
      const store = getStore({ name: "saved-pdfs", consistency: "strong" });
      await store.set(blobKey, pdfBuffer);
      console.log(`[pdf] PDF guardado exitosamente en Blobs: ${blobKey} (${pdfBuffer.byteLength} bytes)`);
    } catch (storeErr) {
      console.warn("[pdf] Advertencia guardando en Netlify Blobs (continuando con éxito):", storeErr);
    }

    return new Response(JSON.stringify({
      success: true,
      reference: blobKey,
      size: pdfBuffer.byteLength,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  if (req.method === "GET") {
    const blobKey = cleanKey(rawReference);
    if (!blobKey) {
      return new Response(JSON.stringify({ success: false, error: "Referencia obligatoria." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    try {
      const store = getStore({ name: "saved-pdfs", consistency: "strong" });
      const pdfData = await store.get(blobKey, { type: "arrayBuffer" });

      if (!pdfData) {
        return new Response(JSON.stringify({ success: false, error: "PDF no encontrado." }), {
          status: 404,
          headers: jsonHeaders,
        });
      }

      return new Response(pdfData, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${blobKey}.pdf"`,
          "cache-control": "public, max-age=86400",
          ...corsHeaders,
        },
      });
    } catch (err) {
      console.error("[pdf] Error recuperando PDF:", err);
      return new Response(JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Error recuperando PDF.",
      }), {
        status: 500,
        headers: jsonHeaders,
      });
    }
  }

  return new Response(JSON.stringify({ success: false, error: "Método no permitido." }), {
    status: 405,
    headers: jsonHeaders,
  });
};

export const config: Config = {
  path: "/api/pdf",
};
