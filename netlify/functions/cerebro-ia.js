import chatAssistant from "./chat-assistant.js";

export const PACKAGING_REGEX = /(big\s*bag|saco|sling|palet|envasad)/i;

export function detectPackaging(text) {
    if (!text || typeof text !== "string") return false;
    return PACKAGING_REGEX.test(text.toLowerCase());
}

export function extractPromptText(bodyBuffer, contentType) {
    if (!bodyBuffer) return "";
    try {
        const text = typeof bodyBuffer === "string" ? bodyBuffer : new TextDecoder().decode(bodyBuffer);
        if (contentType?.includes("application/json")) {
            const parsed = JSON.parse(text);
            return String(parsed.mensaje || parsed.UserContext || parsed.prompt || parsed.text || parsed.message || "");
        }
        return text;
    } catch {
        return "";
    }
}

export function applyPackagingOverride(responseObj, promptText = "") {
    if (!responseObj || typeof responseObj !== "object") return responseObj;

    const promptLower = String(promptText || "").toLowerCase();
    const actionPayload = responseObj.payload || responseObj.data?.payload || null;
    const target = actionPayload || responseObj;

    const combinedText = [
        promptLower,
        String(target.cargo_type || "").toLowerCase(),
        String(target.cargoType || "").toLowerCase(),
        String(target.product || "").toLowerCase(),
        String(target.cargoProduct || "").toLowerCase(),
        String(target.productoEspecifico || "").toLowerCase(),
        String(target.productSpecific || "").toLowerCase(),
        String(target.mercancia || "").toLowerCase(),
        String(target.commodity || "").toLowerCase(),
        String(target.category || "").toLowerCase(),
        String(target.cargoCategory || "").toLowerCase(),
        String(target.categoriaCarga || "").toLowerCase(),
        String(target.packingType || "").toLowerCase(),
        String(target.packaging || "").toLowerCase(),
        String(responseObj.reply || "").toLowerCase(),
        String(responseObj.respuesta || "").toLowerCase(),
    ].join(" ");

    // Inyectar Regex de Prioridad de Envase
    const hasPackaging = PACKAGING_REGEX.test(combinedText);
    if (!hasPackaging) return responseObj;

    // Sobrescribir la Clasificación "A Granel": Si la expresión regular detecta un envase, el código debe
    // interceptar y bloquear cualquier asignación por defecto a "granel" (Bulk). Debe forzar que la categoría
    // de la carga cambie a "Minerales y Construcción" (o la genérica aplicable) y el producto específico a
    // "Big Bags (Minerales/Cemento)" o el equivalente en tu base de datos de estados.
    const overrideEntity = (obj) => {
        if (!obj || typeof obj !== "object") return;

        // Categoría forzada
        obj.category = "Minerales y Construcción";
        obj.cargoCategory = "Minerales y Construcción";
        obj.cargo_category = "Minerales y Construcción";
        obj.categoriaCarga = "Minerales y Construcción";

        // Producto específico forzado
        obj.product = "Big Bags (Minerales/Cemento)";
        obj.cargoProduct = "Big Bags (Minerales/Cemento)";
        obj.cargo_product = "Big Bags (Minerales/Cemento)";
        obj.productoEspecifico = "Big Bags (Minerales/Cemento)";
        obj.productSpecific = "Big Bags (Minerales/Cemento)";

        // Especificación contractual forzada
        obj.cargoSpecification = "10";
        obj.cargo_specification = "10";
        obj.especificacionCargaId = "10";

        // Envase forzado
        obj.packingType = "Big Bags";
        obj.packaging = "Big Bags";
        obj.packageType = "Big Bags";
        obj.tipoEmpaque = "Big Bags";

        // Tipo de carga
        obj.cargoType = "Minerales y Construcción";
        obj.cargo_type = "Big Bags (Minerales/Cemento)";

        // Interceptar y bloquear cualquier asignación por defecto a "granel" (Bulk)
        if (obj.vesselType && /bulk/i.test(obj.vesselType)) {
            obj.vesselType = "General Cargo (Geared Breakbulk)";
        }
        if (obj.selectedVessel && obj.selectedVessel.vesselType && /bulk/i.test(obj.selectedVessel.vesselType)) {
            obj.selectedVessel.vesselType = "General Cargo (Geared Breakbulk)";
        }
        if (!obj.loadingMethod || /cuchara|grab|bulk|granel/i.test(obj.loadingMethod)) {
            obj.loadingMethod = "Big Bags - Grúa Barco";
        }
        if (!obj.dischargeMethod || /cuchara|grab|bulk|granel/i.test(obj.dischargeMethod)) {
            obj.dischargeMethod = "Big Bags - Grúa Barco";
        }
        obj.methodPOL = "big_bags_barco";
        obj.methodPOD = "big_bags_barco";
        obj.isBulk = false;
        obj.is_bulk = false;
        obj.isGranel = false;
        obj.isBigBags = true;
    };

    if (actionPayload && typeof actionPayload === "object") {
        overrideEntity(actionPayload);
    }
    if (responseObj.data?.payload && typeof responseObj.data.payload === "object") {
        overrideEntity(responseObj.data.payload);
    }
    overrideEntity(responseObj);

    return responseObj;
}

export default async function proxyRequest(request) {
    // 🔴 ESTA ES LA URL REAL DE TU BACKEND (DATA BRIDGE)
    const BACKEND_URL = "https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/cerebro-ia";

    // 1. Manejar las peticiones de seguridad CORS del navegador
    if (request.method === "OPTIONS") {
        return new Response("ok", { 
            status: 200, 
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS"
            } 
        });
    }

    try {
        // 2. Extraer el Content-Type original (Vital para que no se rompan los PDFs)
        const contentType = request.headers.get("content-type");
        
        const fetchOptions = {
            method: request.method,
            headers: {
                // INYECCIÓN DE CONTEXTO: Le decimos a Data Bridge que somos de barcos
                "X-App-Context": "maritime"
            },
        };

        if (contentType) {
            fetchOptions.headers["Content-Type"] = contentType;
        }

        // 3. Extraer el cuerpo de la petición de forma binaria para soportar archivos
        let promptText = "";
        const req = request;
        if (request.method === "POST") {
            try {
                if (contentType?.includes("multipart/form-data") && typeof req.formData === "function") {
                    const formData = await req.formData();
                    const bodyPart = formData.get("body") || formData.get("mensaje") || formData.get("UserContext");
                    if (bodyPart) {
                        promptText = typeof bodyPart === "string" ? bodyPart : "";
                        try {
                            const parsed = JSON.parse(promptText);
                            promptText = String(parsed.mensaje || parsed.UserContext || promptText);
                        } catch {}
                    }
                }
            } catch {}

            const rawBody = await request.arrayBuffer();
            fetchOptions.body = rawBody;
            if (!promptText) {
                promptText = extractPromptText(rawBody, contentType);
            }
        }

        // 4. Reenviar todo al cerebro real en Data Bridge
        const response = await fetch(BACKEND_URL, fetchOptions);
        
        // 5. Capturar la respuesta de Data Bridge
        const responseData = await response.text();
        let finalResponseData = responseData;

        try {
            const parsed = JSON.parse(responseData);
            applyPackagingOverride(parsed, promptText);
            finalResponseData = JSON.stringify(parsed);
        } catch {
            // Si la respuesta no es JSON válido, se devuelve intacta
        }

        // 6. Devolverla a Core PRO con la clasificación de envase priorizada
        return new Response(finalResponseData, {
            status: response.status,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            }
        });

    } catch (error) {
        console.error("[Proxy Core PRO] Error conectando con Data Bridge; evaluando fallback local:", error);
        try {
            if (typeof chatAssistant === "function") {
                const fallbackRes = await chatAssistant(request);
                return fallbackRes;
            }
        } catch (localError) {
            console.error("[Proxy Core PRO] Error en fallback local:", localError);
        }
        return new Response(JSON.stringify({
            success: false,
            intent: "ERROR",
            action: "none",
            respuesta: "Error de conexión: El frontend no pudo alcanzar el servidor Data Bridge.",
            payload: {}
        }), { 
            status: 500, 
            headers: { 
                "Content-Type": "application/json", 
                "Access-Control-Allow-Origin": "*" 
            } 
        });
    }
}
