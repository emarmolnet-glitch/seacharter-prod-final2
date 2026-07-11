(function initSeaCharterNplSecretModule(global) {
    'use strict';

    const MODULE_NAME = 'SeaCharter NPL Secret Module';
    const MODULE_VERSION = '1.2.0';
    const DATA_BRIDGE_NOTICE = 'ESTE DOCUMENTO ES SOLO A TÍTULO INFORMATIVO. LOS CÁLCULOS DEFINITIVOS DEBEN REALIZARSE EN LA CALCULADORA SEACHARTER';
    const analysisEngine = global.SeaCharterNplDataAnalysisEngine;

    if (!analysisEngine) {
        throw new Error('SeaCharter NPL Data Analysis Engine no esta cargado.');
    }

    function money(value) {
        return `USD ${Number(value || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })}`;
    }

    function buildComparativeReport(analysis, sourceProfile, detectionMatrix) {
        const detectedCount = detectionMatrix.filter((item) => item.detected).length;
        const missingCount = detectionMatrix.length - detectedCount;
        const lines = [
            'INFORME COMPARATIVO PREVIO A JSON',
            `Motor especializado: ${analysisEngine.name} v${analysisEngine.version}`,
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

    function normalizeOrigin(value) {
        return value === 'Core PRO' ? 'Core PRO' : 'Externo';
    }

    function buildTechnicalVessel(vessel, origenDatos) {
        const detectedAt = new Date().toISOString();
        return {
            imo: vessel.imo ? Number(String(vessel.imo).replace(/\D/g, '')) || 0 : 0,
            is_audit_required: false,
            vessel_name: vessel.vesselName || 'N/A',
            dwt: Number.isFinite(Number(vessel.dwt)) ? Math.trunc(Number(vessel.dwt)) : 0,
            has_gears: false,
            flag: vessel.flag || 'N/A',
            last_port: 'N/A',
            vessel_type: vessel.vesselType || 'N/A',
            year_built: Number.isFinite(Number(vessel.yearBuilt)) ? Math.trunc(Number(vessel.yearBuilt)) : 0,
            owner_manager: 'N/A',
            draft_meters: 0,
            eta: 'N/A',
            detected_at: detectedAt,
            origen_datos: origenDatos,
            dates: vessel.dates || '',
            ports: vessel.ports || '',
            quantity: Number(vessel.quantity) || 0,
            owner_cost: Number(vessel.ownerCost) || 0,
            owner_internal_price: Number(vessel.ownerInternalPrice) || 0,
            charterer_sale_freight: Number(vessel.chartererSaleFreight) || 0,
            cost_breakdown: { ...(vessel.costBreakdown || {}) }
        };
    }

    function buildDataBridgePackage(text, options = {}) {
        const { analysis, sourceProfile, detectionMatrix } = analysisEngine.analyze(text);
        const origenDatos = normalizeOrigin(options.origenDatos);
        const comparativeReport = buildComparativeReport(analysis, sourceProfile, detectionMatrix);
        const rows = analysis.vessels.map((vessel) =>
            `${vessel.vesselName || 'No presente'} | ${money(vessel.ownerCost)} | ${money(vessel.ownerInternalPrice)} | ${money(vessel.chartererSaleFreight)}`
        ).join('\n');
        const printableReport = [
            'RODAHMAR SHIPPING SL - MOTOR NPL INDEPENDIENTE',
            `Documento: ${analysis.documentType}`,
            `Motor de analisis: ${analysisEngine.name} v${analysisEngine.version}`,
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
        const technicalVessels = analysis.vessels.map((vessel) => buildTechnicalVessel(vessel, origenDatos));
        const manualImportPackage = {
            format: 'seacharter.npl.external.v1',
            source: 'core-pro-npl-direct',
            created_at: new Date().toISOString(),
            origen_datos: origenDatos,
            vessels: technicalVessels
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
            confirmation: 'Paquete JSON preparado para envío directo a SeaCharter Data Bridge. No se ha interactuado con ninguna base de datos.',
            safetyNotice: 'Modo independiente: el motor especializado analiza datos localmente y envía el JSON directamente sin pasar por el Motor de Coincidencias.'
        };
    }

    global.SeaCharterNplSecretModule = Object.freeze({
        name: MODULE_NAME,
        version: MODULE_VERSION,
        notice: DATA_BRIDGE_NOTICE,
        analysisEngine,
        parseNumber: analysisEngine.parseNumber,
        calculateCommercialCascade: analysisEngine.calculateCommercialCascade,
        extractCommercialData: analysisEngine.extractCommercialData,
        analyzeData: analysisEngine.analyze,
        buildDataBridgePackage
    });

    global.SeaCharterNlpSecretModule = global.SeaCharterNplSecretModule;
}(window));
