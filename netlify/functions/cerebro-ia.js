import chatAssistant from "./chat-assistant.js";
import { calcularDss } from "./_shared/dss-calculations.mjs";
import { parseOperationalRate } from "./_shared/calculator-autofill-reasoning.mjs";

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

    const allInFloor = Number(contexto_ui.allInRateGross) || 0;
    const proposedFreight = Number(Math.max(Math.max(flete, allInFloor) * 1.08, breakEven * 1.18).toFixed(2));
    const proposedDischargeRate = Math.max(dischargeRate, 2500);

    return {
        success: true,
        accion_ui: "renderizar_auditoria_dss",
        veredicto_general: veredicto,
        reporte_estrategico: `Auditoría Estratégica Ejecutiva MADRE para la operación ${pol} ➔ ${pod} (${cargoQty.toLocaleString('es-ES')} MT de ${commodity}).\n\nEl análisis financiero y operativo determina un Break-Even base de $${breakEven.toFixed(2)}/MT frente a un flete nominal de $${flete.toFixed(2)}/MT (Margen neto actual: ${marginPct.toFixed(1)}%). Flete ALL-IN GROSS: $${allInFloor.toFixed(2)}/MT (incluye JWC, lastre y comisiones); los incrementos estratégicos parten de este mínimo.\n\nSe detecta un cuello de botella relevante en el ritmo de descarga (${dischargeRate.toLocaleString('es-ES')} MT/d) que dilata la permanencia en muelle frente a los días efectivos de mar. Asimismo, la ausencia de cláusulas específicas de congestión y régimen WWD SHINC traslada incertidumbre al armador. Se recomienda formalizar la Opción B estratégica, ajustando el flete a $${proposedFreight.toFixed(2)}/MT e implementando protecciones de plancha y laytime.`,
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
            return String(parsed.mensaje || parsed.mensajeUsuario || parsed.UserContext || parsed.prompt || parsed.text || parsed.message || "");
        }
        return text;
    } catch {
        return "";
    }
}

// Los ritmos explícitos tienen prioridad sobre defaults y estimaciones del backend.
export function applyOperationalRateOverride(responseObj, promptText = "") {
    const loadingRate = parseOperationalRate(promptText, "load");
    const dischargeRate = parseOperationalRate(promptText, "discharge");
    const targets = [responseObj, responseObj?.payload, responseObj?.data?.payload,
        responseObj?.action, responseObj?.action?.payload, responseObj?.data,
        responseObj?.parametros, responseObj?.data?.parametros];
    for (const target of targets) {
        if (!target || typeof target !== "object") continue;
        if (loadingRate) {
            for (const key of ["loadRate", "loadingRate", "loading_rate", "ratePOL", "ritmo_carga"]) target[key] = loadingRate;
        }
        if (dischargeRate) {
            for (const key of ["dischRate", "dischargeRate", "discharge_rate", "ratePOD", "ritmo_descarga"]) target[key] = dischargeRate;
        }
    }
    return responseObj;
}

export function applyPackagingOverride(responseObj, promptText = "") {
    if (!responseObj || typeof responseObj !== "object") return responseObj;

    const promptLower = String(promptText || "").toLowerCase();
    const actionPayload = responseObj.payload || responseObj.data?.payload || null;

    const overrideEntity = (obj) => {
        if (!obj || typeof obj !== "object") return;

        const textClues = [
            promptLower,
            String(obj.cargo_type || "").toLowerCase(),
            String(obj.cargoType || "").toLowerCase(),
            String(obj.mercancia || "").toLowerCase(),
            String(obj.commodity || "").toLowerCase(),
            String(obj.product || "").toLowerCase(),
            String(obj.cargoProduct || "").toLowerCase(),
            String(obj.productoEspecifico || "").toLowerCase(),
            String(obj.productSpecific || "").toLowerCase(),
            String(obj.category || "").toLowerCase(),
            String(obj.cargoCategory || "").toLowerCase(),
            String(obj.categoriaCarga || "").toLowerCase(),
            String(obj.packingType || "").toLowerCase(),
            String(obj.packaging || "").toLowerCase(),
            String(obj.packageType || "").toLowerCase(),
            String(obj.tipoEmpaque || "").toLowerCase(),
            String(responseObj.reply || "").toLowerCase(),
            String(responseObj.respuesta || "").toLowerCase(),
        ].filter(Boolean).join(" ");

        const normalized = textClues
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();

        const extractedProduct = String(
            obj.product
            || obj.cargoProduct
            || obj.productoEspecifico
            || obj.productSpecific
            || obj.cargo_type
            || obj.cargoType
            || obj.mercancia
            || obj.commodity
            || ""
        ).trim();

        // 1. Envases
        const isPallet = /\b(palet|palets|pallet|pallets|paletizad[ao]|paletizado|paletizada)\b/.test(normalized);
        const isBigBag = /\b(big\s*bags?|bigbags?|jumbo\s*bags?|sacos?|bagged|slings?|envasad[ao])\b/.test(normalized);
        const hasEnvase = isPallet || isBigBag || PACKAGING_REGEX.test(normalized);
        const isBulk = !hasEnvase && (/\b(granel|bulk)\b/.test(normalized) || obj.isBulk === true || obj.isGranel === true);

        // 2. Coches / Maquinaria / Piezas Sueltas / Eólicos / Breakbulk
        const isBreakbulk = /\b(coche|coches|auto|autos|automovil|automoviles|vehiculo|vehiculos|cars?|vehicles?|camion|camiones|trucks?|maquinaria|machinery|equipos?|equipment|piezas?\s*(sueltas?|especiales?|de\s*proyecto)?|spare\s*parts?|eolico|eolicos|aerogenerador|aerogeneradores|wind\s*turbines?|palas?\s*(eolicas?)?|blades?|transformador|transformadores|yate|yates|yacht|yachts?|breakbulk|heavy\s*lift|carga\s*de\s*proyecto)\b/.test(normalized);

        // 3. Acero / Bobinas / Chatarra / Siderúrgica
        const isSteel = /\b(acero|steel|bobinas?|coils?|tubos?|pipes?|tuberia|chatarra|scrap|hierro|iron|varillas?|rebar|billets?|palanquilla|perfiles|aluminio|aluminum|aluminium|siderurgic[ao]s?)\b/.test(normalized);

        // 4. Biomasa / Astillas / Combustibles Sólidos
        const isBiomass = /\b(biomasa|biomass|astillas?|wood\s*chips?|pellets?|grignon|orujo|carbon(\s*mineral)?|coal|coque|coke)\b/.test(normalized);

        // 5. Cemento / Minerales
        const isCementOrMineral = /\b(cemento|cement|clinker|clinquer|yeso|gypsum|cal|lime|cenizas|slag)\b/.test(normalized);

        // 6. Madera
        const isWood = /\b(madera|maderas|wood|timber|lumber|tableros|pasta\s*de\s*madera)\b/.test(normalized);

        // 7. Fertilizantes / Agrícola
        const isFertilizer = /\b(fertilizante|fertilizantes|fertilizer|fertilizers|urea|npk|fosfato|nitrato|potasa|abono|abonos)\b/.test(normalized);
        const isGrain = /\b(trigo|wheat|maiz|corn|cebada|soja|soybeans|grano|granos|grain|cereal|cereales|agricola)\b/.test(normalized);

        // Si no hay ninguna coincidencia de carga ni de envase, no intervenir
        if (!hasEnvase && !isBulk && !isBreakbulk && !isSteel && !isBiomass && !isCementOrMineral && !isWood && !isFertilizer && !isGrain && !extractedProduct) {
            return;
        }

        let category = "";
        let product = extractedProduct;
        let specificationId = "100";
        let packaging = isBulk ? "A granel" : "";
        let packingType = isBulk ? "A granel" : "";
        let isFinalBulk = isBulk;
        let isFinalBigBags = false;
        let methodPOL = "";
        let methodPOD = "";
        let loadingMethod = "";
        let dischargeMethod = "";

        if (isBreakbulk) {
            // Coches / Maquinaria / Piezas Sueltas / Eólicos
            category = "Carga de Proyecto (Breakbulk)";
            packaging = "Breakbulk";
            packingType = "Breakbulk";
            specificationId = "90";
            product = extractedProduct || "Piezas Especiales / Maquinaria";
            methodPOL = "hierro_acero_barco";
            methodPOD = "hierro_acero_barco";
            loadingMethod = "Hierro/Acero - Grúa Barco";
            dischargeMethod = "Hierro/Acero - Grúa Barco";
            isFinalBulk = false;
        } else if (isSteel) {
            // Acero / Bobinas / Chatarra
            category = "Carga Siderúrgica y Metales";
            specificationId = /\b(aluminio|aluminum|aluminium)\b/.test(normalized) ? "40" : "20";
            packaging = isBulk ? "A granel" : "Breakbulk";
            packingType = packaging;
            if (/\b(bobinas?|coils?)\b/.test(normalized)) {
                product = "Bobinas de Acero (Steel Coils)";
            } else if (/\b(tubos?|pipes?)\b/.test(normalized)) {
                product = "Tubos de Acero (Steel Pipes)";
            } else if (/\b(hierro|chatarra|scrap)\b/.test(normalized)) {
                product = "Hierro / Chatarra";
            } else {
                product = extractedProduct || "Bobinas de Acero (Steel Coils)";
            }
            methodPOL = "hierro_acero_barco";
            methodPOD = "hierro_acero_barco";
            loadingMethod = "Hierro/Acero - Grúa Barco";
            dischargeMethod = "Hierro/Acero - Grúa Barco";
            isFinalBulk = isBulk;
        } else if (isBiomass) {
            // Biomasa / Astillas
            category = "Biomasa y Combustibles Sólidos";
            specificationId = /\b(carbon|coal|coque|coke)\b/.test(normalized) ? "70" : "50";
            packaging = isPallet ? "Palets" : isBigBag ? "Big Bags" : "A granel";
            packingType = packaging;
            if (/\b(carbon|coal|coque|coke)\b/.test(normalized)) {
                product = "Carbón mineral";
            } else {
                product = extractedProduct || "Biomasa (Grignon, Astillas, Pellets)";
            }
            isFinalBulk = packaging === "A granel";
            isFinalBigBags = packaging === "Big Bags";
            if (isFinalBulk) {
                methodPOL = "cuchara_grab";
                methodPOD = "cinta_transportadora";
                loadingMethod = "Cuchara (Grab) - Grúa Barco";
                dischargeMethod = "Cinta Transportadora";
            } else if (isPallet) {
                methodPOL = "paletizado_barco";
                methodPOD = "paletizado_barco";
                loadingMethod = "Paletizado - Grúa Barco";
                dischargeMethod = "Paletizado - Grúa Barco";
            } else if (isBigBag) {
                methodPOL = "big_bags_barco";
                methodPOD = "big_bags_barco";
                loadingMethod = "Big Bags - Grúa Barco";
                dischargeMethod = "Big Bags - Grúa Barco";
            }
        } else if (isCementOrMineral && hasEnvase) {
            // Cemento en big bags / sacos / palets
            category = "Minerales y Construcción";
            specificationId = "10";
            packaging = isPallet ? "Palets" : "Big Bags";
            packingType = isPallet ? "Paletizado" : "Big Bags";
            product = isPallet ? "Carga Paletizada" : "Big Bags (Minerales/Cemento)";
            isFinalBulk = false;
            isFinalBigBags = packaging === "Big Bags";
            methodPOL = isPallet ? "paletizado_barco" : "big_bags_barco";
            methodPOD = methodPOL;
            loadingMethod = isPallet ? "Paletizado - Grúa Barco" : "Big Bags - Grúa Barco";
            dischargeMethod = loadingMethod;
        } else if (isPallet || isWood || isBigBag) {
            // Palets / Madera / Sacos / Big Bags: Categoría obligatoria = "Carga Unitizada / Envasada"
            category = "Carga Unitizada / Envasada";
            packaging = isPallet ? "Palets" : "Big Bags";
            packingType = isPallet ? "Paletizado" : "Big Bags";
            specificationId = isWood ? "50" : isFertilizer ? "30" : isGrain ? "60" : "100";
            product = isPallet
                ? (extractedProduct || "Carga Paletizada")
                : (extractedProduct || (promptLower.includes("cemento") ? "Big Bags (Minerales/Cemento)" : "Big Bags"));
            isFinalBulk = false;
            isFinalBigBags = packaging === "Big Bags";
            methodPOL = isPallet ? "paletizado_barco" : "big_bags_barco";
            methodPOD = methodPOL;
            loadingMethod = isPallet ? "Paletizado - Grúa Barco" : "Big Bags - Grúa Barco";
            dischargeMethod = loadingMethod;
        } else if (isCementOrMineral && isBulk) {
            category = "Minerales y Construcción";
            specificationId = "10";
            packaging = "A granel";
            packingType = "A granel";
            product = /\bclinker\b/.test(normalized) ? "Clínker" : /\byeso\b/.test(normalized) ? "Yeso" : (extractedProduct || "Cemento a granel");
            isFinalBulk = true;
            methodPOL = "cuchara_grab";
            methodPOD = "cinta_transportadora";
            loadingMethod = "Cuchara (Grab) - Grúa Barco";
            dischargeMethod = "Cinta Transportadora";
        } else if (isBulk) {
            // Granel (Bulk): Respeta la categoría original (Minerales, Agrícola, etc.) y establece el envase a "A granel"
            category = obj.category || obj.cargoCategory || obj.categoriaCarga || (isFertilizer ? "Fertilizantes" : isGrain ? "Agrícola" : "");
            specificationId = isFertilizer ? "30" : isGrain ? "60" : "100";
            packaging = "A granel";
            packingType = "A granel";
            product = extractedProduct;
            isFinalBulk = true;
            methodPOL = "cuchara_grab";
            methodPOD = "cinta_transportadora";
            loadingMethod = "Cuchara (Grab) - Grúa Barco";
            dischargeMethod = "Cinta Transportadora";
        } else {
            // Desconocido: nunca asignar "Minerales y Construcción" por defecto
            specificationId = "100";
            category = hasEnvase ? "Carga Unitizada / Envasada" : (obj.category || obj.cargoCategory || "100");
            packaging = isPallet ? "Palets" : isBigBag ? "Big Bags" : (obj.packaging || "");
            packingType = isPallet ? "Paletizado" : (packaging || obj.packingType || "");
            product = extractedProduct;
            isFinalBulk = isBulk;
            isFinalBigBags = packaging === "Big Bags";
        }

        if (category) {
            obj.category = category;
            obj.cargoCategory = category;
            obj.categoriaCarga = category;
            obj.cargo_category = category;
        }
        if (product) {
            obj.product = product;
            obj.cargoProduct = product;
            obj.productoEspecifico = product;
            obj.productSpecific = product;
            obj.cargo_product = product;
        }
        obj.cargoSpecification = specificationId;
        obj.cargo_specification = specificationId;
        obj.especificacionCargaId = specificationId;

        if (packaging) {
            obj.packaging = packaging;
            obj.packageType = packaging;
            obj.tipoEmpaque = packaging;
            obj.packingType = packingType;
        }
        obj.isBulk = isFinalBulk;
        obj.is_bulk = isFinalBulk;
        obj.isGranel = isFinalBulk;
        obj.isBigBags = isFinalBigBags;

        if (methodPOL) {
            obj.methodPOL = methodPOL;
            obj.loadingMethod = loadingMethod;
        }
        if (methodPOD) {
            obj.methodPOD = methodPOD;
            obj.dischargeMethod = dischargeMethod;
        }

        if (!isFinalBulk) {
            if (obj.vesselType && /bulk/i.test(obj.vesselType)) {
                obj.vesselType = "General Cargo (Geared Breakbulk)";
            }
            if (obj.selectedVessel && obj.selectedVessel.vesselType && /bulk/i.test(obj.selectedVessel.vesselType)) {
                obj.selectedVessel.vesselType = "General Cargo (Geared Breakbulk)";
            }
        }
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

            // DSS: expose raw tool calculations only; MADRE owns the final report.
            if (contentType?.includes("application/json")) {
                try {
                    const text = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
                    const parsed = JSON.parse(text);
                    if (parsed?.current_module === "decisiones" || parsed?.currentModule === "decisiones") {
                        const auditResponse = calcularDss(parsed.contexto_ui || parsed.contexto || parsed);
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
            applyOperationalRateOverride(parsed, promptText);
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
                if (fallbackRes.ok && fallbackRes.headers.get("content-type")?.includes("application/json")) {
                    const parsed = await fallbackRes.json();
                    applyOperationalRateOverride(parsed, promptText);
                    return new Response(JSON.stringify(parsed), { status: fallbackRes.status, headers: fallbackRes.headers });
                }
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
