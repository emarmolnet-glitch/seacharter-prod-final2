(function initSeaCharterNplSecretModule(global) {
    'use strict';

    const MODULE_NAME = 'SeaCharter NPL Secret Module';
    const MODULE_VERSION = '1.1.0';
    const DATA_BRIDGE_NOTICE = 'ESTE DOCUMENTO ES SOLO A TÍTULO INFORMATIVO. LOS CÁLCULOS DEFINITIVOS DEBEN REALIZARSE EN LA CALCULADORA SEACHARTER';

    function parseNumber(value) {
        const raw = String(value || '').trim();
        if (!raw) return 0;
        const compact = raw.replace(/\s/g, '');
        const normalized = compact.includes(',') && compact.includes('.')
            ? compact.replace(/\./g, '').replace(',', '.')
            : compact.replace(',', '.');
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

    function money(value) {
        return `USD ${Number(value || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })}`;
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

    function buildDetectionMatrix(analysis, sourceProfile) {
        const vessel = analysis.vessels[0] || {};
        const breakdown = vessel.costBreakdown || {};
        const fields = [
            ['Tipo de fuente', sourceProfile.sourceType, 'contexto'],
            ['Buque', vessel.vesselName, 'dato comercial'],
            ['DWT', vessel.dwt, 'dato tecnico'],
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

    function buildComparativeReport(analysis, sourceProfile, detectionMatrix) {
        const detectedCount = detectionMatrix.filter((item) => item.detected).length;
        const missingCount = detectionMatrix.length - detectedCount;
        const lines = [
            'INFORME COMPARATIVO PREVIO A JSON',
            `Fuente analizada: ${sourceProfile.sourceType}`,
            `Lectura local: ${sourceProfile.lineCount} linea(s), ${sourceProfile.wordCount} palabra(s), ${sourceProfile.numericCount} valor(es) numerico(s).`,
            `Campos detectados: ${detectedCount} / ${detectionMatrix.length}`,
            `Campos pendientes: ${missingCount}`,
            sourceProfile.requiresManualReview ? 'Revision requerida: SI. Verificar o completar texto visible antes de exportar.' : 'Revision requerida: Verificacion comercial recomendada antes de exportar.',
            '',
            'Comparativa de deteccion:',
            ...detectionMatrix.map((item) => `- ${item.field}: ${item.status}${item.detected ? ` -> ${item.value}` : ''}`),
            '',
            analysis.summary,
            DATA_BRIDGE_NOTICE
        ];
        return lines.join('\n');
    }

    function extractCommercialData(text) {
        const source = String(text || '');
        const normalized = source.replace(/\r/g, '\n');
        const vesselName = findText([
            /(?:buque|vessel|ship|mv|m\/v)\s*[:\-]\s*([^\n,;]+)/i,
            /(?:nombre\s+del\s+buque|vessel\s+name)\s*[:\-]\s*([^\n,;]+)/i
        ], normalized);
        const dwt = findNumber([
            /(?:dwt|deadweight)\s*[:\-]?\s*([\d.,]+)/i,
            /([\d.,]+)\s*(?:dwt|mt\s+dwt|mts\s+dwt)\b/i
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
            documentType: 'Motor NPL independiente - arma secreta Data Bridge',
            summary: hasVessel
                ? 'Analisis local estricto generado en memoria. Los campos ausentes no se han inferido.'
                : 'No se detectaron campos comerciales suficientes en el material recibido.',
            vessels: hasVessel ? [{
                vesselName,
                dwt,
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

    function buildDataBridgePackage(text) {
        const analysis = extractCommercialData(text);
        const sourceProfile = detectSourceProfile(text);
        const detectionMatrix = buildDetectionMatrix(analysis, sourceProfile);
        const comparativeReport = buildComparativeReport(analysis, sourceProfile, detectionMatrix);
        const rows = analysis.vessels.map((vessel) =>
            `${vessel.vesselName || 'No presente'} | ${money(vessel.ownerCost)} | ${money(vessel.ownerInternalPrice)} | ${money(vessel.chartererSaleFreight)}`
        ).join('\n');
        const printableReport = [
            'RODAHMAR SHIPPING SL - MOTOR NPL INDEPENDIENTE',
            `Documento: ${analysis.documentType}`,
            `Fecha: ${new Date().toISOString().slice(0, 10)}`,
            '',
            'Datos extraidos estrictamente del material recibido:',
            ...analysis.vessels.map((vessel) => `- Buque: ${vessel.vesselName || 'No presente'} | DWT: ${vessel.dwt || 'No presente'} | Fechas: ${vessel.dates || 'No presente'} | Puertos: ${vessel.ports || 'No presente'} | Cantidad: ${vessel.quantity || 'No presente'}`),
            '',
            'Panel de Decision',
            'Buque | Coste Armador Total | Precio Int. Armador (+15%) | Flete Venta Fletador (10%)',
            rows || 'Sin buques detectados.',
            '',
            DATA_BRIDGE_NOTICE
        ].join('\n');
        const manualImportPackage = {
            source: 'Rodahmar Shipping SL Motor NPL independiente',
            module: {
                name: MODULE_NAME,
                version: MODULE_VERSION,
                independence: 'standalone_browser_memory_only',
                role: 'secret_weapon_data_capture_to_json'
            },
            preparedFor: 'SeaCharter Data Bridge manual import',
            preparedAt: new Date().toISOString(),
            persistenceMode: 'manual_copy_paste_only',
            databaseAction: 'none',
            prismaAction: 'none',
            migrationAction: 'none',
            serverWritePermission: false,
            extractionPolicy: 'strict_no_inference',
            warning: DATA_BRIDGE_NOTICE,
            preExportAnalysis: {
                sourceProfile,
                comparativeReport,
                detectionMatrix
            },
            extractedData: analysis.vessels.map((vessel) => ({
                vesselName: vessel.vesselName || null,
                dwt: vessel.dwt || null,
                dates: vessel.dates || null,
                ports: vessel.ports || null,
                quantity: vessel.quantity || null,
                ownerTotalCost: vessel.ownerCost || null,
                ownerInternalPricePlus15Percent: vessel.ownerInternalPrice || null,
                chartererSaleFreight: vessel.chartererSaleFreight || null,
                costBreakdown: vessel.costBreakdown
            })),
            formulas: {
                ownerTotalCost: 'opex + capex + bunker + port_expenses_and_demurrage',
                ownerInternalPricePlus15Percent: 'owner_total_cost * 1.15',
                chartererSaleFreight: 'owner_internal_price_plus_15_percent / (1 - 0.0375)'
            },
            decisionPanelColumns: {
                vessel: 'Buque',
                ownerTotalCost: 'Coste Armador',
                ownerInternalPricePlus15Percent: 'Precio Int. Armador (+15%)',
                chartererSaleFreight: 'Flete Venta Fletador (10%)'
            }
        };

        return {
            success: true,
            mode: 'standalone_secret_module_manual_data_bridge_import_only',
            analysis,
            sourceProfile,
            detectionMatrix,
            comparativeReport,
            printableReport,
            manualImportPackage,
            manualImportJson: JSON.stringify(manualImportPackage, null, 2),
            persistedCount: 0,
            confirmation: 'Paquete JSON preparado para carga manual en SeaCharter Data Bridge. No se ha interactuado con base de datos, Prisma ni migraciones.',
            safetyNotice: 'Modo independiente: el motor solo analiza texto disponible, calcula y genera salida manual en memoria e interfaz.'
        };
    }

    global.SeaCharterNplSecretModule = Object.freeze({
        name: MODULE_NAME,
        version: MODULE_VERSION,
        notice: DATA_BRIDGE_NOTICE,
        parseNumber,
        calculateCommercialCascade,
        extractCommercialData,
        buildDataBridgePackage
    });

    global.SeaCharterNlpSecretModule = global.SeaCharterNplSecretModule;
}(window));
