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

    function buildDataBridgePackage(text) {
        const { analysis, sourceProfile, detectionMatrix } = analysisEngine.analyze(text);
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
        const manualImportPackage = analysis.vessels.map((vessel) => ({
            nombre_buque: vessel.vesselName || 'N/A',
            imo: vessel.imo ? String(vessel.imo) : 'N/A',
            dwt: Number.isFinite(Number(vessel.dwt)) ? Math.trunc(Number(vessel.dwt)) : 0
        }));

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
            safetyNotice: 'Modo independiente: el motor especializado analiza datos localmente; la fachada NPL solo prepara reportes y JSON manual.'
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
