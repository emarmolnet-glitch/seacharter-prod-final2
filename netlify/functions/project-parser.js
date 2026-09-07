// netlify/functions/project-parser.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";

/**
 * Función serverless para Netlify que extrae datos logísticos de un PDF.
 * Recibe una solicitud POST con el PDF en base64 (como JSON o body directo).
 * Devuelve un objeto Response con el JSON extraído.
 */
export async function handler(event, context) {
  // Manejo de CORS para solicitudes OPTIONS (si tu frontend está en otro dominio)
  if (event.httpMethod === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  // 1️⃣ Verificar método HTTP
  if (event.httpMethod !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    // 2️⃣ Obtener el PDF en base64 según el Content-Type
    const contentType = event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";
    let pdfBase64 = "";

    if (contentType.includes("application/json")) {
      // Caso habitual: el frontend envía { pdfBase64: "..." }
      const body = JSON.parse(event.body || "{}");
      pdfBase64 = body.pdfBase64 || body.data || body.base64 || "";
      if (!pdfBase64) {
        throw new Error("No se encontró 'pdfBase64' en el JSON enviado.");
      }
    } else {
      // Si se envía el PDF crudo (binario) o base64 directamente
      const rawBody = event.body || "";
      const buffer = Buffer.from(rawBody, event.isBase64Encoded ? "base64" : "utf8");
      pdfBase64 = buffer.toString("base64");
    }

    // Validar que no esté vacío y limitar tamaño (evitar errores)
    if (!pdfBase64) {
      throw new Error("No se recibió un PDF válido.");
    }

    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    console.log(`Tamaño del PDF: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    if (pdfBuffer.length > 5 * 1024 * 1024) { // 5 MB de advertencia
      console.warn("PDF grande: podría exceder límites de Netlify o tiempo de procesamiento.");
    }

    // 3️⃣ Verificar API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY no configurada en variables de entorno.");
    }

    // 4️⃣ Inicializar Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    // Ajusta el modelo según disponibilidad (gemini-2.5-flash puede no estar activo para todos)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 5️⃣ Prompt detallado para extracción de datos logísticos
    const prompt = `
      Analiza el siguiente documento PDF de logística marítima.
      Extrae la información relevante y devuélvela **únicamente** en formato JSON válido, sin comentarios ni markdown.
      El JSON debe tener esta estructura exacta:
      {
        "success": true,
        "items": [
          {
            "tipo": "string",          // Ej: "Flete", "Contenedor", "Embarque", etc.
            "descripcion": "string",   // Descripción del ítem o mercancía
            "puerto_origen": "string",
            "puerto_destino": "string",
            "fecha_embarque": "string", // Formato ISO 8601 o texto original
            "fecha_llegada": "string",
            "buque": "string",
            "contenedor": "string",
            "cantidad": "string|number",
            "peso": "string|number",
            "volumen": "string|number",
            "otros": "string"          // Cualquier dato adicional relevante
          }
        ]
      }
      Si no encuentras información, devuelve { "success": false, "items": [] }.
      No incluyas texto fuera del JSON.
    `;

    // 6️⃣ Llamar a Gemini con el PDF como inlineData
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: pdfBase64,
          mimeType: "application/pdf",
        },
      },
    ]);

    const responseText = result.response.text();
    console.log("Respuesta cruda de Gemini:", responseText);

    // 7️⃣ Limpiar y parsear la respuesta JSON
    const cleanJson = responseText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    let parsedData;
    try {
      parsedData = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Error parseando JSON de Gemini:", parseError);
      parsedData = { success: false, items: [], error: "Respuesta no válida del modelo" };
    }

    // 8️⃣ Construir la respuesta exitosa con formato Response
    const dataBase64 = `data:application/pdf;base64,${pdfBase64}`;
    return new Response(
      JSON.stringify({
        success: true,
        items: parsedData.items || [],
        documentMeta: {
          name: "Documento_Proyecto.pdf",
          size: pdfBuffer.length,
          itemsCount: (parsedData.items || []).length,
          uploadedAt: new Date().toISOString(),
          dataBase64: dataBase64, // Opcional: devolver el PDF en base64 para descargar
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Ajusta según CORS
        },
      }
    );
  } catch (error) {
    console.error("Error crítico en la función:", error);
    // 9️⃣ Devolver error también como Response
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Error interno del servidor",
        items: [],
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
