(function initSeaCharterNplDataAnalysisEngine(global) {
    'use strict';

    const MODULE_NAME = 'SeaCharter NPL Data Analysis Engine';
    const MODULE_VERSION = '1.0.0';
    const DATA_BRIDGE_NOTICE = 'ESTE DOCUMENTO ES SOLO A TÍTULO INFORMATIVO. LOS CÁLCULOS DEFINITIVOS DEBEN REALIZARSE EN LA CALCULADORA SEACHARTER';

    function parseNumber(value) {
        const raw = String(value || '').trim();
        if (!raw) return 0;
        const compact = raw.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
        const commaCount = (compact.match(/,/g) || []).length;
        const dotCount = (compact.match(/\./g) || []).length;
        let normalized = compact;

        if (commaCount && dotCount) {
            const decimalSeparator = compact.lastIndexOf(',') > compact.lastIndexOf('.') ? ',' : '.';
            const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
            normalized = compact.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
        } else if (commaCount || dotCount) {
            const separator = commaCount ? ',' : '.';
            const groups = compact.split(separator);
            const isThousandsFormat = groups.length > 1 && groups.slice(1).every((group) => /^\d{3}$/.test(group));
            normalized = isThousandsFormat ? groups.join('') : compact.replace(separator, '.');
        }
        const numeric = Number(normalized.replace(/[^\d.-]/g, ''));
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function findText(patterns, source) {
        for (const pattern of patterns) {
            const match = source.match(pattern);
            if (match && match[1]) return match[2] ? `${match[1].trim()} / ${match[2].trim()}` : match[1].trim();
        }
        return '';
    }

    function findNumber(patterns, source) {
        const value = findText(patterns, source);
        return value ? parseNumber(value) : 0;
    }

    function calculateCommercialCascade(ownerCost) {
        const ownerInternalPrice = ownerCost * 1.15;
        const chartererSaleFreight = ownerInternalPrice / (1 - 0.0375);
        return { ownerInternalPrice, chartererSaleFreight };
    }

    function detectSourceProfile(text) {
        const source = String(text || '');
        const lower = source.toLowerCase();
        const isPhoto = /\[(?:fotograf[ií]a|foto)\s+captada\s+por\s+motor\s+npl/i.test(source) || lower.includes('image/');
        const isScannedPdf = /\[pdf\s+escaneado\s+captado\s+por\s+motor\s+npl/i.test(source);
        const lineCount = source.split(/\n+/).filter((line) => line.trim()).length;
        const wordCount = (source.match(/\b[\wÀ-ÿ.-]+\b/g) || []).length;
        const numericCount = (source.match(/\d[\d.,]*/g) || []).length;

        return {
            sourceType: isPhoto ? 'Fotografia / imagen' : (isScannedPdf ? 'PDF escaneado sin texto OCR' : 'Texto o documento con texto extraible'),
            lineCount,
            wordCount,
            numericCount,
            requiresManualReview: isPhoto || isScannedPdf || wordCount < 12,
            notes: isPhoto || isScannedPdf
                ? 'La fuente no contiene OCR automatico. El usuario debe completar o corregir el texto visible antes de exportar JSON.'
                : 'El analisis usa solo texto disponible localmente, sin inferir campos ausentes.'
        };
    }

    function extractCommercialData(text) {
        const source = String(text || '');
        const normalized = source.replace(/\r/g, '\n');
        const vesselName = findText([
            /(?:buque|vessel|ship|mv|m\/v)\s*[:\-]\s*([^\n,;]+)/i,
            /(?:nombre\s+del\s+buque|vessel\s+name)\s*[:\-]\s*([^\n,;]+)/i
        ], normalized);
        const imo = findText([
            /\bimo\s*(?:no\.?|number|n[uú]mero)?\s*[:\-]?\s*(\d{7})\b/i,
            /\b(\d{7})\b/
        ], normalized);
        const dwt = findNumber([
            /(?:dwt|deadweight)\s*[:\-]?\s*([\d.,]+)/i,
            /([\d.,]+)\s*(?:dwt|mt\s+dwt|mts\s+dwt)\b/i
        ], normalized);
        const vesselType = findText([
            /(?:vessel\s*type|ship\s*type|tipo\s+de\s+buque|tipo\s+buque)\s*[:\-]\s*([^\n,;]+)/i,
            /(?:type|tipo)\s*[:\-]\s*([^\n,;]+)/i
        ], normalized);
        const flag = findText([
            /(?:flag|bandera)\s*[:\-]\s*([^\n,;]+)/i
        ], normalized);
        const yearBuilt = findNumber([
            /(?:year\s*built|built\s*year|built|a[nñ]o\s+de\s+construcci[oó]n|a[nñ]o)\s*[:\-]?\s*((?:19|20)\d{2})/i
        ], normalized);
        const dates = findText([
            /(?:fechas|dates|laycan)\s*[:\-]\s*([^\n;]+)/i,
            /\b(laycan\s+[^\n;]+)/i
        ], normalized);
        const ports = findText([
            /(?:puertos|ports|route)\s*[:\-]\s*([^\n;]+)/i,
            /(?:pol\s*\/\s*pod|load\s*\/\s*disch)\s*[:\-]\s*([^\n;]+)/i,
            /(?:from|desde)\s+([^,\n;]+)\s+(?:to|a|hasta)\s+([^,\n;]+)/i
        ], normalized).replace(/\s{2,}/g, ' ');
        const quantity = findNumber([
            /(?:cantidad|quantity|cargo|qty)\s*[:\-]?\s*([\d.,]+)\s*(?:mt|mts|tons|toneladas|t)?/i,
            /([\d.,]+)\s*(?:mt|mts|tons|toneladas)\b/i
        ], normalized);

        const costBreakdown = {
            opex: findNumber([/(?:opex|operating\s+expense|coste\s+operativo|costo\s+operativo)\s*[:\-]?\s*(?:usd|\$)?\s*([\d.,]+)/i], normalized),
            capex: findNumber([/(?:capex|capital\s+expense|coste\s+capital|costo\s+capital)\s*[:\-]?\s*(?:usd|\$)?\s*([\d.,]+)/i], normalized),
            bunker: findNumber([/(?:bunker|combustible|fuel)\s*[:\-]?\s*(?:usd|\$)?\s*([\d.,]+)/i], normalized),
            portExpensesAndDemurrage: findNumber([/(?:gastos\s+portuarios\s*(?:\/|y)?\s*demoras|gastos\s+portuarios|port\s+expenses|port\s+costs|demoras|demurrage)\s*[:\-]?\s*(?:usd|\$)?\s*([\d.,]+)/i], normalized)
        };
        const explicitOwnerCost = findNumber([
            /(?:coste\s+armador\s+total|costo\s+armador\s+total|owner\s+total\s+cost|total\s+cost)\s*[:\-]?\s*(?:usd|\$)?\s*([\d.,]+)/i
        ], normalized);
        const ownerCost = explicitOwnerCost || Object.values(costBreakdown).reduce((sum, value) => sum + value, 0);
        const cascade = calculateCommercialCascade(ownerCost);
        const hasVessel = Boolean(vesselName || dwt || dates || ports || quantity || ownerCost);

        return {
            documentType: 'Motor NPL independiente - analisis de datos Data Bridge',
            summary: hasVessel
                ? 'Analisis local estricto generado en memoria. Los campos ausentes no se han inferido.'
                : 'No se detectaron campos comerciales suficientes en el material recibido.',
            vessels: hasVessel ? [{
                vesselName,
                imo,
                dwt,
                vesselType,
                flag,
                yearBuilt,
                dates,
                ports,
                quantity,
                ownerCost,
                ownerInternalPrice: cascade.ownerInternalPrice,
                chartererSaleFreight: cascade.chartererSaleFreight,
                costBreakdown
            }] : []
        };
    }

    function buildDetectionMatrix(analysis, sourceProfile) {
        const vessel = analysis.vessels[0] || {};
        const breakdown = vessel.costBreakdown || {};
        const fields = [
            ['Tipo de fuente', sourceProfile.sourceType, 'contexto'],
            ['Buque', vessel.vesselName, 'dato comercial'],
            ['Tipo de buque', vessel.vesselType, 'dato tecnico'],
            ['IMO', vessel.imo, 'dato tecnico'],
            ['DWT', vessel.dwt, 'dato tecnico'],
            ['Bandera', vessel.flag, 'dato tecnico'],
            ['Año', vessel.yearBuilt, 'dato tecnico'],
            ['Fechas / Laycan', vessel.dates, 'operacion'],
            ['Puertos / Ruta', vessel.ports, 'operacion'],
            ['Cantidad', vessel.quantity, 'carga'],
            ['OPEX', breakdown.opex, 'coste'],
            ['CAPEX', breakdown.capex, 'coste'],
            ['Bunker', breakdown.bunker, 'coste'],
            ['Gastos portuarios / demoras', breakdown.portExpensesAndDemurrage, 'coste'],
            ['Coste armador total', vessel.ownerCost, 'calculo/base'],
            ['Precio interno armador +15%', vessel.ownerInternalPrice, 'calculo'],
            ['Flete venta fletador', vessel.chartererSaleFreight, 'calculo']
        ];

        return fields.map(([field, value, category]) => {
            const detected = typeof value === 'number' ? value > 0 : Boolean(String(value || '').trim());
            return {
                field,
                category,
                detected,
                value: detected ? value : null,
                status: detected ? 'Detectado' : 'No detectado',
                action: detected ? 'Revisar contra documento original' : 'Completar manualmente antes de exportar si aplica'
            };
        });
    }

    function analyze(text) {
        const analysis = extractCommercialData(text);
        const sourceProfile = detectSourceProfile(text);
        const detectionMatrix = buildDetectionMatrix(analysis, sourceProfile);
        return { analysis, sourceProfile, detectionMatrix };
    }

    function validateOperationalCoherence(explicitMode = 'Manual', overrides = {}) {
        const modeRaw = String(explicitMode || 'Manual').trim();
        const mode = (modeRaw.toLowerCase().includes('auto') || modeRaw === 'Automático') ? 'Automático' : 'Manual';

        const cargoQty = Number.isFinite(overrides.cargoQty) ? Number(overrides.cargoQty) : 0;
        const cargoCategory = String(overrides.cargoCategory || '').trim();
        const cargoProduct = String(overrides.cargoProduct || '').trim();
        const productOrCat = cargoProduct || cargoCategory || 'Mercancía No Especificada';

        const methodPolText = String(overrides.methodPol || '').trim();
        const methodPodText = String(overrides.methodPod || '').trim();
        const methodDisplay = [methodPolText, methodPodText].filter(Boolean).join(' / ') || 'Método Estándar';

        let rateLoad = Number.isFinite(overrides.rateLoad) ? Number(overrides.rateLoad) : 0;
        let rateDisch = Number.isFinite(overrides.rateDisch) ? Number(overrides.rateDisch) : 0;
        let effectiveQty = cargoQty;

        let isSwapCorrected = false;
        if (mode === 'Automático' && effectiveQty > 0 && (rateLoad > 0 || rateDisch > 0)) {
            const maxRateVal = Math.max(rateLoad, rateDisch);
            if (effectiveQty < maxRateVal && maxRateVal >= 5000 && effectiveQty <= 5000) {
                const temp = effectiveQty;
                effectiveQty = maxRateVal;
                if (rateLoad === maxRateVal) rateLoad = temp;
                if (rateDisch === maxRateVal) rateDisch = temp;
                isSwapCorrected = true;
            }
        }

        let isAnomaly = false;
        let causeMessage = '';

        const isPneumatic = methodPolText.includes('Bombas Neumáticas') || methodPodText.includes('Bombas Neumáticas')
            || methodPolText.includes('bombas_neumaticas') || methodPodText.includes('bombas_neumaticas');
        const isBelt = methodPolText.includes('Cinta Transportadora') || methodPodText.includes('Cinta Transportadora')
            || methodPolText.includes('cinta_transportadora') || methodPodText.includes('cinta_transportadora');
        const isTruck = methodPolText.includes('Camión Tolva') || methodPodText.includes('Camión Tolva')
            || methodPolText.includes('camion_tolva') || methodPodText.includes('camion_tolva');
        const isGrab = methodPolText.includes('Cuchara') || methodPodText.includes('Cuchara')
            || methodPolText.includes('cuchara_grab') || methodPodText.includes('cuchara_grab');
        const isShipCrane = methodPolText.includes('Grúa Barco') || methodPodText.includes('Grúa Barco')
            || methodPolText.includes('_barco') || isGrab;

        const prodLower = productOrCat.toLowerCase();
        const maxRate = Math.max(rateLoad, rateDisch);
        const isHighSpeedBulk = (isBelt || isPneumatic) && (prodLower.includes('cemento') || prodLower.includes('clinker') || prodLower.includes('grano') || prodLower.includes('carbón'));

        if (isSwapCorrected) {
            isAnomaly = true;
            causeMessage = `Incongruencia detectada en extracción automática: Confusión entre cantidad total (${rateLoad.toLocaleString()} MT) y tasa diaria (${effectiveQty.toLocaleString()} TM/d). La IA corrigió la interpretación antes de completar la planilla.`;
        } else if (!isHighSpeedBulk && effectiveQty >= 5000 && maxRate > 0) {
            if (maxRate === effectiveQty && effectiveQty >= 5000) {
                isAnomaly = true;
                causeMessage = `Confusión entre la cantidad total (${effectiveQty.toLocaleString()} MT) y la tasa diaria (${maxRate.toLocaleString()} TM/d). Se declaró un ritmo idéntico al volumen total de la embarcación.`;
            } else if (maxRate > 0.6 * effectiveQty && maxRate > 8000) {
                isAnomaly = true;
                causeMessage = `Traslape entre Volumen Total (${effectiveQty.toLocaleString()} MT) y Tasa Diaria (TMD de ${maxRate.toLocaleString()} TM/d), implicando un ritmo físico inviable para el equipamiento.`;
            }
        } else if (effectiveQty > 0 && effectiveQty < 3000 && maxRate >= 12000) {
            isAnomaly = true;
            causeMessage = `Incongruencia entre la cantidad total reducida (${effectiveQty.toLocaleString()} MT) y una tasa diaria sobredimensionada (${maxRate.toLocaleString()} TM/d).`;
        }

        if (!isAnomaly) {
            if (isPneumatic) {
                const isPowder = prodLower.includes('cemento') || prodLower.includes('ceniza') || prodLower.includes('fly ash') || prodLower.includes('polvo') || prodLower.includes('yeso');
                if (!isPowder || prodLower.includes('clínker') || prodLower.includes('clinker') || prodLower.includes('acero') || prodLower.includes('carbón') || prodLower.includes('big bags') || prodLower.includes('palet')) {
                    isAnomaly = true;
                    causeMessage = `El método Bombas Neumáticas / Tuberías es físicamente incompatible con productos no pulverulentos (${productOrCat}). Clíker, carbón o acero obstruyen las líneas neumáticas.`;
                }
            } else if (isBelt) {
                const isBaggedOrSteel = prodLower.includes('acero') || prodLower.includes('siderúrgic') || prodLower.includes('palet') || prodLower.includes('unitariz') || prodLower.includes('breakbulk');
                if (isBaggedOrSteel) {
                    isAnomaly = true;
                    causeMessage = `La Cinta Transportadora no permite la manipulación de piezas siderúrgicas, mercancía unitarizada o paletizada (${productOrCat}).`;
                }
            } else if (isGrab) {
                const isNotBulk = prodLower.includes('palet') || prodLower.includes('big bags') || prodLower.includes('acero') || prodLower.includes('siderúrgic') || prodLower.includes('vehículo') || prodLower.includes('proyecto');
                if (isNotBulk) {
                    isAnomaly = true;
                    causeMessage = `La Cuchara (Grab) es técnicamente incompatible con palets, big bags o piezas siderúrgicas (${productOrCat}).`;
                }
            }
        }

        if (!isAnomaly && maxRate > 0) {
            if (isShipCrane) {
                if ((prodLower.includes('big bags') || prodLower.includes('palet')) && maxRate > 4500) {
                    isAnomaly = true;
                    causeMessage = `Superación del límite técnico de las grúas del buque para carga envasada/big bags (${maxRate.toLocaleString()} TM/d declarados vs. ritmo máximo de ~1,500-3,000 TM/d).`;
                } else if ((prodLower.includes('acero') || prodLower.includes('siderúrgic')) && maxRate > 5500) {
                    isAnomaly = true;
                    causeMessage = `Superación del límite técnico de las grúas del buque para productos siderúrgicos (${maxRate.toLocaleString()} TM/d declarados vs. ritmo máximo de ~1,500-3,500 TM/d).`;
                } else if (isGrab && maxRate > 8500) {
                    isAnomaly = true;
                    causeMessage = `Superación del límite físico de las grúas del buque con almeja/grab (${maxRate.toLocaleString()} TM/d declarados vs. capacidad máxima de ~4,000-6,000 TM/d).`;
                }
            } else if (isTruck && maxRate > 9000) {
                isAnomaly = true;
                causeMessage = `Superación de la capacidad técnica de evacuación por Camión Tolva (${maxRate.toLocaleString()} TM/d declarados vs. techo operativo ~3,000-6,000 TM/d).`;
            } else if (isPneumatic && maxRate > 16000) {
                isAnomaly = true;
                causeMessage = `Superación de la capacidad técnica de bombeo neumático continuo (${maxRate.toLocaleString()} TM/d declarados vs. techo operativo ~6,000-12,000 TM/d).`;
            }
        }

        if (!isAnomaly && effectiveQty >= 5000 && maxRate > 0 && maxRate < 150) {
            isAnomaly = true;
            causeMessage = `Tasa diaria declarada (${maxRate} TM/d) desproporcionadamente baja para un volumen total de ${effectiveQty.toLocaleString()} MT, generando una estadía irreal.`;
        }

        const headerText = `- [ALERTA DE COHERENCIA OPERATIVA (Modo ${mode})]:`;
        const diagnosticText = `- Diagnóstico: Incompatibilidad detectada entre el tipo de mercancía (${productOrCat}), el método (${methodDisplay}) y las cantidades/tasas declaradas.`;
        const causeText = `- Causa probable: ${causeMessage}`;
        const behaviorText = `- Comportamiento: Mostrar advertencia visual permitiendo al usuario continuar o corregir los datos manualmente sin bloquear el flujo del sistema.`;
        const formattedAlert = `${headerText}\n  ${diagnosticText}\n  ${causeText}\n  ${behaviorText}`;

        return {
            active: isAnomaly,
            mode: `Modo ${mode}`,
            cargo: productOrCat,
            method: methodDisplay,
            qty: effectiveQty,
            rateLoad,
            rateDisch,
            diagnosis: diagnosticText,
            probableCause: causeMessage,
            behavior: "Mostrar advertencia visual permitiendo al usuario continuar o corregir los datos manualmente sin bloquear el flujo del sistema.",
            formattedAlert
        };
    }

    global.validateOperationalCoherence = validateOperationalCoherence;

    global.SeaCharterNplDataAnalysisEngine = Object.freeze({
        name: MODULE_NAME,
        version: MODULE_VERSION,
        notice: DATA_BRIDGE_NOTICE,
        parseNumber,
        findText,
        findNumber,
        calculateCommercialCascade,
        detectSourceProfile,
        extractCommercialData,
        buildDetectionMatrix,
        validateOperationalCoherence,
        analyze
    });
}(window));
