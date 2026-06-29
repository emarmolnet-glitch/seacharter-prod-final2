// =============================================================================
// SeaCharter Core PRO — Módulo de cumplimiento CBAM (Carbon Border Adjustment Mechanism)
// -----------------------------------------------------------------------------
// Módulo independiente y encapsulado. No depende del motor de fletes ni lo modifica.
// Toda la lógica está diseñada para fallar de forma silenciosa (devolver 0) y nunca
// detener el script principal de la calculadora.
// =============================================================================

// Los 27 Estados miembros de la Unión Europea (códigos ISO 3166-1 alpha-2).
export const EU_COUNTRIES = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
    'SI', 'ES', 'SE'
];

const COUNTRY_NAME_TO_CODE = {
    'alemania': 'DE',
    'germany': 'DE',
    'austria': 'AT',
    'belgica': 'BE',
    'belgium': 'BE',
    'bulgaria': 'BG',
    'chequia': 'CZ',
    'czech republic': 'CZ',
    'czechia': 'CZ',
    'chipre': 'CY',
    'croacia': 'HR',
    'croatia': 'HR',
    'dinamarca': 'DK',
    'denmark': 'DK',
    'eslovaquia': 'SK',
    'eslovenia': 'SI',
    'espana': 'ES',
    'spain': 'ES',
    'estonia': 'EE',
    'finlandia': 'FI',
    'francia': 'FR',
    'france': 'FR',
    'grecia': 'GR',
    'greece': 'GR',
    'hungria': 'HU',
    'irlanda': 'IE',
    'ireland': 'IE',
    'italia': 'IT',
    'italy': 'IT',
    'letonia': 'LV',
    'lituania': 'LT',
    'luxemburgo': 'LU',
    'malta': 'MT',
    'paises bajos': 'NL',
    'netherlands': 'NL',
    'holland': 'NL',
    'polonia': 'PL',
    'poland': 'PL',
    'portugal': 'PT',
    'rumania': 'RO',
    'romania': 'RO',
    'suecia': 'SE',
    'sweden': 'SE',
    'argelia': 'DZ',
    'algeria': 'DZ',
    'argentina': 'AR',
    'australia': 'AU',
    'brasil': 'BR',
    'brazil': 'BR',
    'canada': 'CA',
    'chile': 'CL',
    'china': 'CN',
    'colombia': 'CO',
    'egipto': 'EG',
    'egypt': 'EG',
    'estados unidos': 'US',
    'united states': 'US',
    'usa': 'US',
    'india': 'IN',
    'indonesia': 'ID',
    'japon': 'JP',
    'japan': 'JP',
    'marruecos': 'MA',
    'morocco': 'MA',
    'mexico': 'MX',
    'noruega': 'NO',
    'norway': 'NO',
    'reino unido': 'GB',
    'united kingdom': 'GB',
    'uk': 'GB',
    'rusia': 'RU',
    'russia': 'RU',
    'singapur': 'SG',
    'singapore': 'SG',
    'sudafrica': 'ZA',
    'south africa': 'ZA',
    'suiza': 'CH',
    'switzerland': 'CH',
    'tunez': 'TN',
    'tunisia': 'TN',
    'turquia': 'TR',
    'turkey': 'TR',
    'ucrania': 'UA',
    'ukraine': 'UA'
};

// Matriz oficial de factores dinámicos por nivel de riesgo (tCO₂e por tonelada de producto).
export const CBAM_FACTORS = {
    'cemento': { alto: 0.85, medio: 0.72, bajo: 0.58 },
    'acero': { alto: 1.80, medio: 1.45, bajo: 0.65 },
    'aluminio': { alto: 6.50, medio: 4.50, bajo: 3.00 },
    'fertilizantes': { alto: 1.50, medio: 1.25, bajo: 0.95 }
};

export const DEFAULT_EMISSION_FACTORS = {
    'Cemento': CBAM_FACTORS.cemento.alto,
    'Hierro/Acero': CBAM_FACTORS.acero.alto,
    'Aluminio': CBAM_FACTORS.aluminio.alto,
    'Fertilizantes': CBAM_FACTORS.fertilizantes.alto
};

// Factores de emisión (tCO₂e por tonelada de producto) por sector regulado.
export const CBAM_DATA = {
    'Minerals and Rocks':       { product: 'Cemento', emissionFactor: DEFAULT_EMISSION_FACTORS.Cemento },
    'Metals & Steel Products':  { product: 'Hierro/Acero', emissionFactor: DEFAULT_EMISSION_FACTORS['Hierro/Acero'] },
    'Aluminum':                 { product: 'Aluminio', emissionFactor: DEFAULT_EMISSION_FACTORS.Aluminio },
    'Fertilizers':              { product: 'Fertilizantes', emissionFactor: DEFAULT_EMISSION_FACTORS.Fertilizantes }
};

// Clasificación automática desde términos comerciales comunes hacia sectores Shipnext/CBAM.
export const KEYWORD_MAP = {
    'cemento': 'Minerals and Rocks',
    'cement': 'Minerals and Rocks',
    'clinker': 'Minerals and Rocks',
    'cemento portland': 'Minerals and Rocks',
    'portland cement': 'Minerals and Rocks',
    'acero': 'Metals & Steel Products',
    'steel': 'Metals & Steel Products',
    'bobinas': 'Metals & Steel Products',
    'coils': 'Metals & Steel Products',
    'hierro': 'Metals & Steel Products',
    'iron': 'Metals & Steel Products',
    'tuberias': 'Metals & Steel Products',
    'tuberías': 'Metals & Steel Products',
    'pipes': 'Metals & Steel Products',
    'aluminio': 'Aluminum',
    'aluminium': 'Aluminum',
    'aluminum': 'Aluminum',
    'urea': 'Fertilizers',
    'nitrato': 'Fertilizers',
    'nitrate': 'Fertilizers',
    'fertilizante': 'Fertilizers',
    'fertilizantes': 'Fertilizers',
    'fertilizer': 'Fertilizers',
    'fertilizers': 'Fertilizers'
};

// Precio de referencia CBAM 2026 (EUR por tCO₂e).
export const PRICE_2026 = 75.36;
export const EU_CARBON_PRICE = PRICE_2026;

// Objeto de estado global del módulo para garantizar la sincronización.
export let cbamState = {
    sector: 'cemento',
    origen: '',
    destino: '',
    tonelaje: 0,
    factorManual: null,
    impuestoOrigen: 0,
    esValido: false,
    calculos: { escenarioA: 0, escenarioB: 0, escenarioC: 0, ahorro: 0 },
    factores: { escenarioA: CBAM_FACTORS.cemento.alto, escenarioB: CBAM_FACTORS.cemento.medio, escenarioC: CBAM_FACTORS.cemento.bajo },
    mensaje: 'Datos insuficientes para el cálculo'
};

// Equivalencias de nombre de sector para tolerar entradas Shipnext y términos comunes.
const SECTOR_ALIASES = {
    'minerals and rocks': 'Minerals and Rocks',
    'cemento': 'Minerals and Rocks',
    'cement': 'Minerals and Rocks',
    'metals & steel products': 'Metals & Steel Products',
    'metals and steel products': 'Metals & Steel Products',
    'hierro/acero': 'Metals & Steel Products',
    'hierro acero': 'Metals & Steel Products',
    'hierro': 'Metals & Steel Products',
    'acero': 'Metals & Steel Products',
    'steel': 'Metals & Steel Products',
    'aluminio': 'Aluminum',
    'aluminium': 'Aluminum',
    'aluminum': 'Aluminum',
    'fertilizers': 'Fertilizers',
    'fertilizantes': 'Fertilizers',
    'fertilizante': 'Fertilizers',
    'fertilizer': 'Fertilizers'
};

// Normaliza texto: minúsculas, sin acentos y sin espacios sobrantes.
function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const EU_COUNTRY_CODES = new Set(EU_COUNTRIES);

export function extractCountryCode(value) {
    const match = String(value || '').match(/\(([A-Za-z]{2})\)/);
    return match ? match[1].toUpperCase() : '';
}

function normalizeCountryCode(value) {
    const codeFromParentheses = extractCountryCode(value);
    if (codeFromParentheses) return codeFromParentheses;

    const normalized = normalizeText(value);
    if (!normalized) return '';
    if (/^[a-z]{2}$/.test(normalized)) return normalized.toUpperCase();
    return COUNTRY_NAME_TO_CODE[normalized] || '';
}

function getCountryStatus(value) {
    const code = normalizeCountryCode(value);
    if (!code) return { code, recognized: false, inEU: false };
    return { code, recognized: true, inEU: EU_COUNTRY_CODES.has(code) };
}

const SHIPNEXT_TO_CBAM_SECTOR = {
    'minerals and rocks': 'Cemento',
    'metals & steel products': 'Hierro/Acero',
    'aluminum': 'Aluminio',
    'fertilizers': 'Fertilizantes'
};

const SECTOR_TO_FACTOR_KEY = {
    'Cemento': 'cemento',
    'Hierro/Acero': 'acero',
    'Aluminio': 'aluminio',
    'Fertilizantes': 'fertilizantes'
};

function getSectorData(productType) {
    const sectorKey = SECTOR_ALIASES[normalizeText(productType)];
    const sector = sectorKey ? CBAM_DATA[sectorKey] : undefined;
    if (!sector || typeof sector.emissionFactor !== 'number') return null;
    return { key: sectorKey, factorKey: SECTOR_TO_FACTOR_KEY[sector.product], label: sector.product, emissionFactor: sector.emissionFactor };
}

function getCBAMFactorSet(productType) {
    const normalized = normalizeText(productType);
    const directFactorSet = CBAM_FACTORS[normalized];
    if (directFactorSet && typeof directFactorSet.alto === 'number') return directFactorSet;

    const sector = getSectorData(productType);
    const sectorFactorSet = sector?.factorKey ? CBAM_FACTORS[sector.factorKey] : null;
    return sectorFactorSet && typeof sectorFactorSet.alto === 'number' ? sectorFactorSet : null;
}

function getCBAMFactor(productType) {
    return getCBAMFactorSet(productType)?.alto || 0;
}

function getSectorFactorKey(productType) {
    const normalized = normalizeText(productType);
    if (CBAM_FACTORS[normalized]) return normalized;

    const sector = getSectorData(productType);
    return sector?.factorKey || 'cemento';
}

function getDisplayCountry(value) {
    return String(value || '').trim() || '-';
}

function formatPDFEuro(value) {
    return `${Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function formatPDFNumber(value, decimals = 2) {
    return Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function getJsPDFConstructor() {
    return globalThis.jspdf?.jsPDF || globalThis.jsPDF || null;
}

function safePDFName(value) {
    return String(value || 'operacion')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        || 'operacion';
}

function ensureCBAMStateReady() {
    if (typeof document !== 'undefined') updateCBAMState();
    return cbamState.tonelaje > 0;
}

function drawWrappedText(doc, text, x, y, maxWidth, lineHeight = 5) {
    const lines = doc.splitTextToSize(String(text || ''), maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * lineHeight);
}

function drawHeader(doc, subtitle) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(0, 32, 96);
    doc.text('Rodahmar Shipping', 18, 20);
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('SeaCharter Core PRO · Cumplimiento CBAM', 18, 27);
    doc.setDrawColor(0, 32, 96);
    doc.setLineWidth(0.8);
    doc.line(18, 32, 192, 32);
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(subtitle, 18, 43);
}

function saveDocument(doc, filename) {
    doc.save(filename);
}

export function updateCBAMState(values = null) {
    const fieldValues = values || {
        sector: document.getElementById('cbam-sector')?.value || cbamState.sector,
        origen: document.getElementById('cbam-origin')?.value || '',
        destino: document.getElementById('cbam-destination')?.value || '',
        tonelaje: document.getElementById('cbam-quantity')?.value || 0,
        factorManual: document.getElementById('cbam-reported-emissions')?.value || '',
        impuestoOrigen: document.getElementById('cbam-origin-carbon-paid')?.value || 0
    };

    const factorKey = getSectorFactorKey(fieldValues.sector);
    const factors = CBAM_FACTORS[factorKey] || CBAM_FACTORS.cemento;
    const tonelaje = Math.max(0, Number(fieldValues.tonelaje) || 0);
    const parsedManualFactor = Number(fieldValues.factorManual);
    const factorManual = String(fieldValues.factorManual ?? '').trim() !== '' && isFinite(parsedManualFactor) && parsedManualFactor > 0
        ? parsedManualFactor
        : null;
    const impuestoOrigen = Math.max(0, Number(fieldValues.impuestoOrigen) || 0);
    const origen = getDisplayCountry(fieldValues.origen);
    const destino = getDisplayCountry(fieldValues.destino);
    const originCode = extractCountryCode(origen) || normalizeCountryCode(origen);
    const destinationCode = extractCountryCode(destino) || normalizeCountryCode(destino);
    const originInEU = EU_COUNTRY_CODES.has(originCode);
    const destinationInEU = EU_COUNTRY_CODES.has(destinationCode);
    const geographyIsValid = Boolean(originCode && destinationCode && !originInEU && destinationInEU);
    const factorA = factors.alto;
    const factorB = factorManual || factors.medio;
    const factorC = factorManual || factors.bajo;
    const escenarioA = geographyIsValid ? tonelaje * factorA * PRICE_2026 : 0;
    const escenarioB = geographyIsValid ? tonelaje * factorB * PRICE_2026 : 0;
    const escenarioC = geographyIsValid ? Math.max(0, (tonelaje * factorC) * (PRICE_2026 - impuestoOrigen)) : 0;

    cbamState = {
        sector: factorKey,
        origen,
        destino,
        tonelaje,
        factorManual,
        impuestoOrigen,
        esValido: geographyIsValid && tonelaje > 0,
        calculos: {
            escenarioA,
            escenarioB,
            escenarioC,
            ahorro: Math.max(0, escenarioA - escenarioC)
        },
        factores: { escenarioA: factorA, escenarioB: factorB, escenarioC: factorC },
        mensaje: geographyIsValid ? 'Operación sujeta a CBAM' : 'No sujeto a CBAM'
    };

    return cbamState;
}

export function evaluateCBAMOperation(productType, originCountry, destinationCountry, quantity, reportedEmissions, originCarbonPaid) {
    return evaluateCBAMOperationWithEmissions(productType, originCountry, destinationCountry, quantity, reportedEmissions, originCarbonPaid);
}

function getPositiveNumber(value) {
    const number = Number(value);
    return value !== null
        && value !== undefined
        && String(value).trim() !== ''
        && isFinite(number)
        && number > 0
        ? number
        : 0;
}

function getManualFactorStatus(value, factorSet) {
    const hasManualFactor = value !== null && value !== undefined && String(value).trim() !== '';
    const parsedFactor = Number(value);
    const isNumeric = hasManualFactor && isFinite(parsedFactor);
    const isWithinRange = isNumeric && parsedFactor >= factorSet.bajo && parsedFactor <= factorSet.alto;

    return {
        hasManualFactor,
        factor: isNumeric ? parsedFactor : 0,
        isOutOfRange: hasManualFactor && !isWithinRange,
        message: hasManualFactor && !isWithinRange ? 'Factor fuera de rango para este sector' : ''
    };
}

function buildCBAMRiskScenarios(qty, factorSet, manualEmissionFactor, originCarbonTax) {
    const manualFactor = getManualFactorStatus(manualEmissionFactor, factorSet);
    const scenarioAEmissionFactor = factorSet.alto;
    const scenarioBEmissionFactor = manualFactor.factor || factorSet.medio;
    const scenarioCEmissionFactor = manualFactor.factor || factorSet.bajo;
    const scenarioAEmissions = qty * scenarioAEmissionFactor;
    const scenarioBEmissions = qty * scenarioBEmissionFactor;
    const scenarioCEmissions = qty * scenarioCEmissionFactor;
    const scenarioAGrossCost = scenarioAEmissions * PRICE_2026;
    const scenarioBGrossCost = scenarioBEmissions * PRICE_2026;
    const carbonTaxAtOrigin = Math.max(0, originCarbonTax || 0);
    const scenarioCUnitPrice = Math.max(0, PRICE_2026 - carbonTaxAtOrigin);
    const scenarioCNetCost = scenarioCEmissions * scenarioCUnitPrice;

    return {
        validation: {
            factorOutOfRange: manualFactor.isOutOfRange,
            message: manualFactor.message
        },
        highRisk: {
            key: 'highRisk',
            label: 'Escenario A · Riesgo Alto',
            description: 'Matriz CBAM oficial · nivel alto',
            emissionFactor: scenarioAEmissionFactor,
            emissions: scenarioAEmissions,
            unitCarbonPrice: PRICE_2026,
            carbonTaxAtOrigin: 0,
            cost: scenarioAGrossCost
        },
        mediumRisk: {
            key: 'mediumRisk',
            label: 'Escenario B · Riesgo Medio',
            description: manualFactor.factor
                ? 'Factor manual dentro del rango del sector'
                : 'Matriz CBAM oficial · nivel medio',
            emissionFactor: scenarioBEmissionFactor,
            emissions: scenarioBEmissions,
            unitCarbonPrice: PRICE_2026,
            carbonTaxAtOrigin: 0,
            cost: scenarioBGrossCost
        },
        optimized: {
            key: 'optimized',
            label: 'Escenario C · Coste Optimizado',
            description: manualFactor.factor
                ? 'Factor manual con deducciones por precio carbono en origen'
                : 'Matriz CBAM oficial · nivel bajo con deducciones en origen',
            emissionFactor: scenarioCEmissionFactor,
            emissions: scenarioCEmissions,
            unitCarbonPrice: scenarioCUnitPrice,
            carbonTaxAtOrigin,
            cost: scenarioCNetCost
        }
    };
}

export function evaluateCBAMOperationWithEmissions(productType, originCountry, destinationCountry, quantity, reportedEmissions, originCarbonPaid) {
    try {
        const origin = String(originCountry || '').trim();
        const destination = String(destinationCountry || '').trim();
        const originStatus = getCountryStatus(origin);
        const destinationStatus = getCountryStatus(destination);
        const qty = Number(quantity);
        const sector = getSectorData(productType);
        const reportedFactor = getPositiveNumber(reportedEmissions);
        const carbonTaxAtOrigin = getPositiveNumber(originCarbonPaid);
        const factorSet = sector ? getCBAMFactorSet(productType) : null;
        const emissionFactor = factorSet?.alto || sector?.emissionFactor || 0;
        const calculationMode = reportedFactor > 0 ? 'comparative' : 'default';
        const calculationMessage = reportedFactor > 0
            ? 'Calculando escenarios con emisiones declaradas del proveedor'
            : 'Calculando con valores por defecto de la UE';

        if (!sector || !originStatus.recognized || !destinationStatus.recognized || !isFinite(qty) || qty <= 0 || emissionFactor <= 0) {
            return {
                status: 'insufficient_data',
                origin,
                destination,
                sector: sector?.label || String(productType || '').trim(),
                quantity: isFinite(qty) ? qty : 0,
                emissionFactor,
                carbonPrice: PRICE_2026,
                cost: 0,
                emissions: 0,
                scenarios: null,
                carbonPaidAtOrigin: carbonTaxAtOrigin,
                carbonTaxAtOrigin,
                calculationMode,
                calculationMessage,
                message: 'Datos insuficientes para el cálculo'
            };
        }

        const scenarios = buildCBAMRiskScenarios(qty, factorSet, reportedEmissions, carbonTaxAtOrigin);

        if (!destinationStatus.inEU) {
            return {
                status: 'not_applicable',
                origin,
                destination,
                sector: sector.label,
                quantity: qty,
                emissionFactor,
                carbonPrice: PRICE_2026,
                cost: 0,
                emissions: 0,
                scenarios,
                carbonPaidAtOrigin: carbonTaxAtOrigin,
                carbonTaxAtOrigin,
                calculationMode,
                calculationMessage,
                message: 'No sujeto a CBAM'
            };
        }

        if (originStatus.inEU) {
            return {
                status: 'not_applicable',
                origin,
                destination,
                sector: sector.label,
                quantity: qty,
                emissionFactor,
                carbonPrice: PRICE_2026,
                cost: 0,
                emissions: 0,
                scenarios,
                carbonPaidAtOrigin: carbonTaxAtOrigin,
                carbonTaxAtOrigin,
                calculationMode,
                calculationMessage,
                message: 'No sujeto a CBAM'
            };
        }

        const emissions = qty * emissionFactor;
        const cost = scenarios.highRisk.cost;
        return {
            status: 'subject',
            origin,
            destination,
            sector: sector.label,
            quantity: qty,
            emissionFactor,
            carbonPrice: PRICE_2026,
            cost: isFinite(cost) && cost > 0 ? cost : 0,
            emissions: isFinite(emissions) && emissions > 0 ? emissions : 0,
            scenarios,
            carbonPaidAtOrigin: carbonTaxAtOrigin,
            carbonTaxAtOrigin,
            calculationMode,
            calculationMessage,
            message: 'Operación sujeta a CBAM'
        };
    } catch (error) {
        return {
            status: 'insufficient_data',
            origin: '',
            destination: '',
            sector: '',
            quantity: 0,
            emissionFactor: 0,
            carbonPrice: PRICE_2026,
            cost: 0,
            emissions: 0,
            scenarios: null,
            carbonPaidAtOrigin: 0,
            carbonTaxAtOrigin: 0,
            calculationMode: 'default',
            calculationMessage: 'Calculando con valores por defecto de la UE',
            message: 'Datos insuficientes para el cálculo'
        };
    }
}

/**
 * Clasifica el texto de carga contra el mapa de palabras clave.
 *
 * @param {string} inputString Texto libre introducido por el usuario.
 * @returns {{ category: string, cbamSector: string, keyword: string } | null}
 */
export function autoClassifyCargo(inputString) {
    try {
        const normalizedInput = normalizeText(inputString);
        if (!normalizedInput) return null;

        const matches = Object.entries(KEYWORD_MAP)
            .map(([keyword, category]) => ({ keyword, normalizedKeyword: normalizeText(keyword), category }))
            .filter(({ normalizedKeyword }) => normalizedKeyword && normalizedInput.includes(normalizedKeyword))
            .sort((a, b) => b.normalizedKeyword.length - a.normalizedKeyword.length);

        if (!matches.length) return null;

        const match = matches[0];
        return {
            category: match.category,
            cbamSector: SHIPNEXT_TO_CBAM_SECTOR[normalizeText(match.category)] || '',
            keyword: match.keyword
        };
    } catch (error) {
        return null;
    }
}

/**
 * Calcula el impacto económico estimado del CBAM para una operación.
 *
 * Regla: el impacto es > 0 solo si el país de destino pertenece a la UE
 * y el país de origen NO pertenece a la UE (importación hacia la UE).
 *
 * @param {string} productType        Sector regulado (Cemento, Acero, Aluminio, Fertilizantes).
 * @param {string} originCountry      País de origen de la carga.
 * @param {string} destinationCountry País de destino de la carga.
 * @param {number} quantity           Cantidad transportada (TM).
 * @returns {object|number} Análisis comparativo CBAM, o 0 si no aplica o ante cualquier error.
 */
export function calculateCBAMImpact(productType, originCountry, destinationCountry, quantity, reportedEmissions, originCarbonPaid) {
    try {
        const standaloneTonnage = Number(originCountry);
        if (arguments.length <= 4 && isFinite(standaloneTonnage)) {
            const tonnage = Number(originCountry);
            const originCarbonTax = getPositiveNumber(quantity);
            const factorSet = getCBAMFactorSet(productType);

            if (!factorSet || !isFinite(tonnage) || tonnage <= 0) return 0;
            return buildCBAMRiskScenarios(tonnage, factorSet, destinationCountry, originCarbonTax);
        }

        const result = evaluateCBAMOperationWithEmissions(productType, originCountry, destinationCountry, quantity, reportedEmissions, originCarbonPaid);
        return result.status === 'subject' ? result.scenarios : 0;
    } catch (error) {
        // Garantía de estabilidad: ante cualquier fallo, retorna 0 sin propagar el error.
        return 0;
    }
}

export function generateCBAMRequirementsPDF() {
    try {
        if (!ensureCBAMStateReady()) {
            globalThis.showToast?.('Datos insuficientes para generar requerimientos CBAM');
            return false;
        }

        const JsPDF = getJsPDFConstructor();
        if (!JsPDF) throw new Error('jsPDF no disponible');

        const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        drawHeader(doc, 'REQUERIMIENTOS TÉCNICOS PARA DECLARACIÓN CBAM');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.text(`Operación: ${cbamState.sector.toUpperCase()} · ${formatPDFNumber(cbamState.tonelaje, 0)} TM`, 18, 53);
        doc.text(`Origen: ${cbamState.origen} · Destino: ${cbamState.destino}`, 18, 59);

        const blocks = [
            ['1. Datos de Identificación y Ubicación', 'Nombre legal de la fábrica, dirección exacta y coordenadas geográficas de la instalación productora responsable de la mercancía exportada.'],
            ['2. Clasificación de la Mercancía', 'Código NC de 8 dígitos y detalle de la ruta de producción tecnológica empleada para fabricar el producto sujeto a CBAM.'],
            ['3. Datos de Emisiones Específicas', 'Declaración de emisiones directas e indirectas expresadas en tCO2e/t, incluyendo emisiones implícitas de precursores cuando proceda.'],
            ['4. Precio del Carbono Pagado en Origen', 'Certificación del impuesto, tasa o precio local de carbono abonado en el país de origen para su potencial deducción en la UE.'],
            ['5. Verificación Independiente', 'Informe validado por un verificador externo acreditado por la UE, con alcance, fecha, metodología y evidencias trazables.']
        ];

        let y = 72;
        blocks.forEach(([title, body]) => {
            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(18, y - 6, 174, 24, 2, 2, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(0, 32, 96);
            doc.text(title, 23, y);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(51, 65, 85);
            drawWrappedText(doc, body, 23, y + 6, 160, 4.4);
            y += 30;
        });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text('Advertencia operativa', 18, y + 2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        y = drawWrappedText(
            doc,
            'La ausencia de estos datos forzará la aplicación de los valores por defecto de la UE, provocando un sobrecoste financiero severo y reduciendo la capacidad de deducción documental ante la autoridad competente.',
            18,
            y + 9,
            174,
            4.5
        );

        doc.setDrawColor(0, 32, 96);
        doc.roundedRect(18, y + 8, 174, 32, 2, 2);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 32, 96);
        doc.text('Firma y Sello del Fabricante Exportador', 24, y + 18);
        doc.line(24, y + 31, 110, y + 31);
        doc.text('Fecha:', 126, y + 31);
        doc.line(140, y + 31, 184, y + 31);

        saveDocument(doc, `Requerimientos_CBAM_${safePDFName(cbamState.origen)}_${safePDFName(cbamState.destino)}.pdf`);
        return true;
    } catch (error) {
        globalThis.showToast?.('No se pudo generar el PDF CBAM');
        return false;
    }
}

export function generateCBAMReportPDF() {
    try {
        if (!ensureCBAMStateReady()) {
            globalThis.showToast?.('Datos insuficientes para generar el informe CBAM');
            return false;
        }

        const JsPDF = getJsPDFConstructor();
        if (!JsPDF) throw new Error('jsPDF no disponible');

        const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        drawHeader(doc, 'INFORME EJECUTIVO DE IMPACTO FINANCIERO CBAM');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text('Resumen de la Operación', 18, 55);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Producto: ${cbamState.sector.toUpperCase()}`, 18, 64);
        doc.text(`Tonelaje: ${formatPDFNumber(cbamState.tonelaje, 0)} TM`, 18, 71);
        doc.text(`País de Origen: ${cbamState.origen}`, 105, 64);
        doc.text(`País de Destino: ${cbamState.destino}`, 105, 71);

        const tableY = 86;
        const rows = [
            ['Escenario A (Riesgo Alto)', `Factor Alto (${formatPDFNumber(cbamState.factores.escenarioA, 2)})`, formatPDFEuro(cbamState.calculos.escenarioA)],
            ['Escenario B (Riesgo Medio)', `${cbamState.factorManual ? 'Factor Manual' : 'Factor Medio'} (${formatPDFNumber(cbamState.factores.escenarioB, 2)})`, formatPDFEuro(cbamState.calculos.escenarioB)],
            ['Escenario C (Coste Optimizado)', `${cbamState.factorManual ? 'Factor Manual' : 'Factor Bajo'} (${formatPDFNumber(cbamState.factores.escenarioC, 2)}) con deducción`, formatPDFEuro(cbamState.calculos.escenarioC)]
        ];

        doc.setFillColor(0, 32, 96);
        doc.rect(18, tableY, 174, 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text('Escenario', 22, tableY + 6.5);
        doc.text('Factor aplicado', 82, tableY + 6.5);
        doc.text('Coste calculado', 152, tableY + 6.5);

        let y = tableY + 10;
        rows.forEach((row, index) => {
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
            doc.rect(18, y, 174, 12, 'FD');
            doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            doc.text(row[0], 22, y + 7.5);
            doc.text(row[1], 82, y + 7.5);
            doc.setFont('helvetica', 'bold');
            doc.text(row[2], 152, y + 7.5);
            y += 12;
        });

        doc.setFillColor(236, 253, 245);
        doc.setDrawColor(20, 184, 166);
        doc.roundedRect(18, y + 12, 174, 22, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 97, 80);
        doc.text('Ahorro Potencial mediante Gestión Documental', 24, y + 22);
        doc.setFontSize(16);
        doc.text(formatPDFEuro(cbamState.calculos.ahorro), 150, y + 22);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        drawWrappedText(
            doc,
            'Nota: Esta estimación es informativa basada en el precio de referencia oficial de 2026 (75,36 €/t). No constituye asesoramiento fiscal. La liquidación efectiva de certificados se realizará formalmente a partir de febrero de 2027.',
            18,
            y + 50,
            174,
            4.5
        );

        saveDocument(doc, `Informe_CBAM_${safePDFName(cbamState.origen)}_${safePDFName(cbamState.destino)}.pdf`);
        return true;
    } catch (error) {
        globalThis.showToast?.('No se pudo generar el informe CBAM');
        return false;
    }
}
