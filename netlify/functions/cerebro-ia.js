import chatAssistant from "./chat-assistant.js";

export const PACKAGING_REGEX = /(big\s*bag|saco|sling|palet|envasad)/i;

export function detectPackaging(text) {
    if (!text || typeof text !== "string") return false;
    return PACKAGING_REGEX.test(text.toLowerCase());
}

export function buildDssStrategicAuditResponse(contexto_ui = {}) {
    const pol = String(contexto_ui.pol || 'Rotterdam');
    const pod = String(contexto_ui.pod || 'Houston');
    const cargoQty = Number(contexto_ui.cargoQty || contexto_ui.cargo || 30000);
    const commodity = String(contexto_ui.commodity || 'Siderúrgico / Carga General');
    const flete = Number(contexto_ui.fleteUnitario || contexto_ui.fleteEstimado || contexto_ui.freightSell || 37.0);
    const breakEven = Number(contexto_ui.breakEvenUnitario || contexto_ui.breakEven || 28.5);
    const loadRate = Number(contexto_ui.loadRate || 5000);
    const dischargeRate = Number(contexto_ui.dischargeRate || 2000);

    const marginPct = flete > 0 ? ((flete - breakEven) / flete) * 100 : 0;
    let veredicto = "🟡 Riesgo Moderado - Requiere Ajustes";
    if (marginPct >= 20 && dischargeRate >= 2500) {
        veredicto = "🟢 Favorable con Cláusulas Protectoras";
    } else if (flete < breakEven || marginPct < 8) {
        veredicto = "🔴 Desfavorable - Flete por debajo de Break-Even / Riesgo Operativo";
    }

    const proposedFreight = Number((Math.max(flete * 1.08, breakEven * 1.18)).toFixed(2));
    const proposedDischargeRate = Math.max(dischargeRate, 2500);

    return {
        success: true,
        accion_ui: "renderizar_auditoria_dss",
        veredicto_general: veredicto,
        reporte_estrategico: `Auditoría Estratégica Ejecutiva MADRE para la operación ${pol} ➔ ${pod} (${cargoQty.toLocaleString('es-ES')} MT de ${commodity}).\n\nEl análisis financiero y operativo determina un Break-Even base de $${breakEven.toFixed(2)}/MT frente a un flete nominal de $${flete.toFixed(2)}/MT (Margen neto actual: ${marginPct.toFixed(1)}%).\n\nSe detecta un cuello de botella relevante en el ritmo de descarga (${dischargeRate.toLocaleString('es-ES')} MT/d) que dilata la permanencia en muelle frente a los días efectivos de mar. Asimismo, la ausencia de cláusulas específicas de congestión y régimen WWD SHINC traslada incertidumbre al armador. Se recomienda formalizar la Opción B estratégica, ajustando el flete a $${proposedFreight.toFixed(2)}/MT e implementando protecciones de plancha y laytime.`,
        variables_perjudiciales: [
            `Ritmo de descarga reducido (${dischargeRate.toLocaleString('es-ES')} MT/d) incrementa Port Days y reduce TCE`,
            `Exposición a demoras en atraque por congestión sin cláusula Reachable on Arrival`,
            `Margen comercial vulnerable a sobrecostes de combustible durante navegación de retorno`
        ],
        recomendaciones: [
            {
                accion: `Pactar ritmo de descarga garantizado a ${proposedDischargeRate.toLocaleString('es-ES')} MT/día WWD SHINC con medios de tierra`,
                pro: "Acorta la estancia portuaria proyectada en más de 1.8 días y elimina riesgos por festivos no computables.",
                contra: "Requiere que el fletador / receptor asuma la coordinación o sobrecoste de grúas en muelle."
            },
            {
                accion: `Incrementar Flete Unitario a $${proposedFreight.toFixed(2)} / MT (Opción B Estratégica)`,
                pro: "Garantiza un margen bruto robusto y absorbe posibles sobrecostes derivados de contingencias operativas.",
                contra: "Puede elevar la resistencia de contraoferta en la mesa de negociación inicial."
            },
            {
                accion: "Incorporar Cláusula WIBON / WIPON Protective Clause con preaviso NOR 24h",
                pro: "El tiempo perdido a la espera de muelle libre computa como tiempo de plancha efectivo protegiendo al buque.",
                contra: "Exige estricto control de registros de prácticos y capitanía para la validez del tender."
            }
        ],
        modificaciones_recap: {
            flete: proposedFreight,
            fleteUnitario: proposedFreight,
            allInRateGross: proposedFreight,
            loadRate: loadRate,
            dischargeRate: proposedDischargeRate,
            laytime: proposedDischargeRate,
            clausulas: "WWD SHINC DISCHARGE - REACHABLE ON ARRIVAL - BIMCO WAR RISKS (VOYWAR 2025) - TIME LOST WAITING BERTH TO COUNT AS LAYTIME"
        }
    };
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

    let fallbackRequest = null;
    let rawBody = null;
    let promptText = "";

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
        if (request.method === "POST") {
            // Clonar el request antes de cualquier lectura para disponer de una instancia intacta en el fallback local
            try {
                if (typeof request.clone === "function") {
                    fallbackRequest = request.clone();
                }
            } catch {}

            // Leer el cuerpo de la petición UNA SOLA VEZ y almacenarlo en memoria
            rawBody = await request.arrayBuffer();
            fetchOptions.body = rawBody;

            // Extraer el texto del prompt usando una instancia derivada del buffer para no consumir el stream original
            if (contentType?.includes("multipart/form-data")) {
                try {
                    const req = new Request(request.url, {
                        method: request.method,
                        headers: request.headers,
                        body: rawBody
                    });
                    if (typeof req.formData === "function") {
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
            }

            if (!promptText) {
                promptText = extractPromptText(rawBody, contentType);
            }

            // Si la petición proviene de DSS con current_module: "decisiones", responder con Auditoría Estratégica MADRE
            if (contentType?.includes("application/json")) {
                try {
                    const text = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
                    const parsed = JSON.parse(text);
                    if (parsed?.current_module === "decisiones" || parsed?.currentModule === "decisiones") {
                        const auditResponse = buildDssStrategicAuditResponse(parsed.contexto_ui || parsed.contexto || parsed);
                        return new Response(JSON.stringify(auditResponse), {
                            status: 200,
                            headers: {
                                "Content-Type": "application/json",
                                "Access-Control-Allow-Origin": "*",
                            }
                        });
                    }
                } catch (parseErr) {
                    console.warn("[cerebro-ia] Error inspeccionando payload de decisiones:", parseErr);
                }
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
                const targetReq = (fallbackRequest && !fallbackRequest.bodyUsed)
                    ? fallbackRequest
                    : (rawBody ? new Request(request.url, {
                        method: request.method,
                        headers: request.headers,
                        body: rawBody
                    }) : request);
                const fallbackRes = await chatAssistant(targetReq);
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
