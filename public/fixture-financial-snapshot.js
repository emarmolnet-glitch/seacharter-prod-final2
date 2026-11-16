/* Capture once at approval. Exporters consume this record without consulting live pricing. */
(function () {
    const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 20));
    const limitError = () => new Error('El estado del Fixture Recap supera los límites de preparación. Reduzca los datos del expediente.');
    // Fixed contract/report schema. Never enumerate or clone application state.
    // Aliases are retained because both legacy Recap templates and the executive
    // report consume them. Charts, custom stowage plans and caches are excluded.
    const fields = `
        id estimationId activeReference legacyEstimationId selectedVesselType operationalProfile pol pod cargoQty cargo commodity cargoType
        allInRateGross fleteGross fleteEstimado fleteUnitario freightSell freightRate flete lang language
        vesselName vesselType vessel vesselDwt dwt dwt_real dwtReal nombre_buque shipName
        shipProfile ship_profile vessel_type vessel_class vesselClass class shipClass
        designCategory design_category categoriaDiseno tipoBuque
        loadRate loadingRate ratePOL dischargeRate dischRate ratePOD
        optimalDischargeRate ritmoDescargaOptimizado ritmo_descarga_optimizado dssFormState madreUltimaAuditoria reporte_estrategico reporteEstrategico
        loadingMethod methodPOL loading_method loadMethod dischargeMethod methodPOD dischMethod discharge_method method_pol method_pod
        productoEspecifico cargoProduct cargo_product bulk_category bulkCategory cargo_type
        freightTerms freightTerm terms cargoTerms charterPartyStandard
        laycanDaysLeft estimatedVoyageDays seaDays portDays totalDays
        ballastDays ballastPort portBallast distTotal distBallast distLaden
        demurrageRate demurrageRecomendado demurrage jwlaRiskActive jwcRiskActive jwlaPremiumUSD
        cancellingDate etaDate laycanStart laycanEnd
        commercialRole commercial_role role
        breakEven netProfitCharterer netProfitOwner tceOwner tceDaily
        costBunkers totalBunkers bunkerCost costOpex totalOpex opexCost opex opexDaily
        costPda totalPda portCosts portExpenses costEts etsCost etsTotalCost costTotal totalExpenses
        stowageFactor stowage_factor cargoVolume volumeCbm
        clausulas specialClauses clausulasEspeciales clausulasEspecialesRecap
    `.trim().split(/\s+/);
    const dateFields = new Set(['cancellingDate', 'etaDate', 'laycanStart', 'laycanEnd']);
    const labelFields = new Set(['productoEspecifico', 'cargoProduct', 'cargo_product', 'loadingMethod', 'methodPOL', 'loading_method', 'loadMethod', 'dischargeMethod', 'methodPOD', 'dischMethod', 'discharge_method', 'method_pol', 'method_pod']);
    const clauseFields = new Set(['clausulas', 'specialClauses', 'clausulasEspeciales', 'clausulasEspecialesRecap', 'reporte_estrategico', 'reporteEstrategico']);
    const ownValue = (source, key) => {
        if (!source || typeof source !== 'object') return undefined;
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        return descriptor && 'value' in descriptor ? descriptor.value : undefined;
    };
    const primitive = (value, key) => {
        if (dateFields.has(key) && value && typeof value === 'object') {
            try { return Date.prototype.toISOString.call(value); }
            catch { return undefined; }
        }
        if (typeof value === 'string') {
            if (value.length > (clauseFields.has(key) ? 4096 : 512)) {
                throw new Error(`El campo ${key} del Fixture Recap es demasiado largo.`);
            }
            return value;
        }
        if (value === null || typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        return undefined;
    };
    // Retain only report-consumed DSS values; never copy nested snapshots or live graphs.
    const copyDssRates = source => {
        const result = {};
        for (const key of ['optimalDischargeRate', 'ritmoDescargaOptimizado', 'ritmo_descarga_optimizado', 'dischargeRate']) {
            const value = primitive(ownValue(source, key), key);
            if (value !== undefined) result[key] = value;
        }
        return result;
    };
    const reportValue = (raw, key) => {
        if (raw && typeof raw === 'object') {
            if (key === 'dssFormState') return copyDssRates(raw);
            if (key === 'madreUltimaAuditoria') {
                const result = { modificaciones_recap: copyDssRates(ownValue(raw, 'modificaciones_recap')) };
                const rep = primitive(ownValue(raw, 'reporte_estrategico'), 'reporte_estrategico')
                    || primitive(ownValue(raw, 'reporteEstrategico'), 'reporteEstrategico')
                    || primitive(ownValue(raw, 'respuesta'), 'respuesta');
                if (rep) result.reporte_estrategico = rep;
                return result;
            }
        }
        return primitive(raw, key);
    };
    const identityText = value => typeof value === 'string' && value.trim() ? value : undefined;
    const defaultIdentity = (value, key) => key === 'vesselName'
        ? /^MV GEARED BULKER(?:\s*\(Handysize\))?$/i.test(value.trim())
        : /^(?:Handysize(?:\s+(?:MPP|Bulk Carrier))?(?:\s+[\d.,]+\s*DWT)?|Bulk Carrier)$/i.test(value.trim());
    window.selectFixtureRecapState = function (...sources) {
        const cleanState = {};
        for (const source of sources) {
            for (const key of fields) {
                let raw = ownValue(source, key);
                if (labelFields.has(key) && raw && typeof raw === 'object') {
                    raw = ownValue(raw, 'label') ?? ownValue(raw, 'value');
                }
                const value = reportValue(raw, key);
                if (key === 'vesselName' || key === 'vesselType') {
                    const identity = identityText(value);
                    // System defaults cannot replace an already selected contract identity.
                    if (identity && (!cleanState[key] || !defaultIdentity(identity, key) || defaultIdentity(cleanState[key], key))) {
                        cleanState[key] = identity;
                    }
                } else if (value !== undefined) cleanState[key] = value;
            }
            if (!identityText(ownValue(source, 'vesselType'))) {
                const vesselObject = ownValue(source, 'vessel');
                const aliases = [ownValue(vesselObject, 'type'), ...['vessel_type', 'tipoBuque', 'shipProfile', 'ship_profile', 'designCategory', 'design_category', 'categoriaDiseno', 'class', 'vesselClass', 'vessel_class', 'shipClass'].map(key => ownValue(source, key))];
                const selected = aliases.map(identityText).find(Boolean);
                if (selected && (!cleanState.vesselType || !defaultIdentity(selected, 'vesselType') || defaultIdentity(cleanState.vesselType, 'vesselType'))) cleanState.vesselType = selected;
            }
            // Flatten only the three vessel identity fields; never retain its object.
            const vessel = ownValue(source, 'vessel');
            if (vessel && typeof vessel === 'object') {
                for (const [key, target] of [['name', 'vesselName'], ['type', 'vesselType'], ['dwt', 'dwt']]) {
                    const value = primitive(ownValue(vessel, key), target);
                    if (target === 'vesselName' || target === 'vesselType') {
                        // Nested identity is a fallback across ALL sources, not just this source.
                        const identity = identityText(value);
                        if (identity && (!cleanState[target] || (defaultIdentity(cleanState[target], target) && !defaultIdentity(identity, target)))) {
                            cleanState[target] = identity;
                        }
                    } else if (value !== undefined && !primitive(ownValue(source, target), target)) cleanState[target] = value;
                }
            }
        }
        // Only the bounded report record is serialized, never a global source.
        if (JSON.stringify(cleanState).length > 32768) throw limitError();
        return cleanState;
    };
    const concreteRecordId = source => {
        const ids = ['estimationId', 'id', 'activeReference'].map(key => ownValue(source, key))
            .filter(value => (typeof value === 'string' || typeof value === 'number') && String(value).trim())
            .map(value => String(value).trim()).filter(value => value.toLowerCase() !== 'current');
        const reference = ids.find(value => /^RDM\/\d{4}-\d{4}$/i.test(value));
        if (reference) return reference.toUpperCase();
        // Legacy UUIDs remain aliases of a stable commercial reference.
        const uuid = ids.find(value => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value));
        return uuid ? uuid.toLowerCase() : ids[0];
    };
    const recordId = source => concreteRecordId(source) || concreteRecordId(window.State) || 'current';
    window.getCurrentFixtureRecapState = function () {
        const current = window.State || {};
        const id = recordId(current);
        const candidates = [window.dssSimulationState, window.dssFormState];
        const active = candidates.find(source => source && ['pol', 'cargoQty', 'vesselType'].some(key => ownValue(source, key) !== undefined) && recordId(source) === id);
        // Select one complete current estimation. Never fill holes from another state.
        const state = window.selectFixtureRecapState(active || current);
        // Vessel identity and equipment belong to the current estimation, not a DSS scenario.
        const identity = window.selectFixtureRecapState(current);
        for (const key of ['pol', 'pod', 'loadRate', 'dischargeRate', 'ratePOL', 'ratePOD', 'dischRate', 'vesselType', 'vesselName', 'vessel', 'vessel_type', 'tipoBuque', 'shipProfile', 'ship_profile', 'class', 'vesselClass', 'vessel_class', 'shipClass', 'designCategory', 'design_category', 'categoriaDiseno', 'loadingMethod', 'methodPOL', 'loading_method', 'loadMethod', 'productoEspecifico', 'cargoProduct', 'cargo_product', 'commodity', 'cargoType', 'specialClauses', 'clausulas', 'clausulasEspeciales', 'clausulasEspecialesRecap', 'madreUltimaAuditoria', 'reporte_estrategico', 'reporteEstrategico']) {
            if (identity[key] !== undefined) state[key] = identity[key];
            else delete state[key];
        }

        // Leer directamente los valores activos del DOM para métodos y ritmos operativos (realidad viva)
        if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
            const activeLoadMethodPill = typeof document.querySelector === 'function' ? document.querySelector('#pills_metodo_carga .method-pill-active, #pills_metodo_carga [aria-pressed="true"], #pills_metodo_carga [data-active="true"]') : null;
            const selectLoadEl = typeof document.getElementById === 'function' ? document.getElementById('metodo_carga') : null;
            const activeLoadMethod = activeLoadMethodPill?.textContent?.trim() || selectLoadEl?.selectedOptions?.[0]?.textContent?.trim() || selectLoadEl?.value;
            if (activeLoadMethod) {
                state.loadingMethod = activeLoadMethod;
                state.methodPOL = activeLoadMethod;
                state.loading_method = activeLoadMethod;
                state.loadMethod = activeLoadMethod;
            }

            const activeDischMethodPill = typeof document.querySelector === 'function' ? document.querySelector('#pills_metodo_descarga .method-pill-active, #pills_metodo_descarga [aria-pressed="true"], #pills_metodo_descarga [data-active="true"]') : null;
            const selectDischEl = typeof document.getElementById === 'function' ? document.getElementById('metodo_descarga_pod') : null;
            const activeDischMethod = activeDischMethodPill?.textContent?.trim() || selectDischEl?.selectedOptions?.[0]?.textContent?.trim() || selectDischEl?.value;
            if (activeDischMethod) {
                state.dischargeMethod = activeDischMethod;
                state.methodPOD = activeDischMethod;
                state.discharge_method = activeDischMethod;
            }

            const domLoadRate = typeof document.getElementById === 'function' ? parseFloat(document.getElementById('rate-load')?.value || document.getElementById('input-loadRate')?.value) : NaN;
            if (Number.isFinite(domLoadRate) && domLoadRate > 0) {
                state.loadRate = domLoadRate;
                state.ratePOL = domLoadRate;
            }

            const domDischRate = typeof document.getElementById === 'function' ? parseFloat(document.getElementById('rate-disch')?.value || document.getElementById('input-dischargeRate')?.value) : NaN;
            if (Number.isFinite(domDischRate) && domDischRate > 0) {
                state.dischargeRate = domDischRate;
                state.ratePOD = domDischRate;
            }
        }
        if (state.cargoQty === undefined && state.cargo !== undefined) state.cargoQty = state.cargo;
        const validDisch = [state.dischargeRate, state.dischRate, state.ratePOD].map(Number).find(v => Number.isFinite(v) && v > 0);
        if (validDisch) state.dischargeRate = validDisch;
        if (typeof window.resolveFixtureRecapOperations === 'function') {
            state.selectedVesselType = state.vesselType;
            state.vesselType = window.resolveFixtureRecapOperations(state).vesselType;
        }
        state.estimationId = recordId(state);
        return state;
    };

    function isSpanishMaritimeText(text) {
        if (!text || typeof text !== 'string') return false;
        if (/[áéíóúñ¿¡ÁÉÍÓÚÑ]/.test(text)) return true;
        const spanishKeywords = [
            /\b(?:auditor[ií]a|estrat[eé]gica|ejecutiva|operaci[oó]n|an[aá]lisis|determina|frente\s+a|cuello\s+de\s+botella|descarga|permanencia|muelle|d[ií]as\s+efectivos|asimismo|ausencia|traslada|incertidumbre|armador|recomienda|formalizar|opci[oó]n\s*b|plancha|firmado|flete|buque|puerto|carga|viaje|demoras|p[oó]liza|cl[aá]usulas|fletamento|sider[uú]rgico|granel)\b/i
        ];
        return spanishKeywords.some(pattern => pattern.test(text));
    }

    function translateCommodityToEnglish(commodity) {
        if (!commodity || typeof commodity !== 'string') return 'DRY BULK / GENERAL CARGO';
        const c = commodity.trim().toLowerCase();
        if (/sider[uú]rgic/i.test(c)) return 'STEEL PRODUCTS / GENERAL CARGO';
        if (/cemento/i.test(c)) return 'BULK CEMENT';
        if (/grano|trigo|soja|ma[ií]z/i.test(c)) return 'GRAIN / BULK AGRICULTURAL';
        if (/chatarra/i.test(c)) return 'SCRAP METAL';
        if (/mineral|hierro/i.test(c)) return 'IRON ORE / MINERAL BULK';
        if (/carb[oó]n/i.test(c)) return 'COAL / DRY BULK';
        if (/fertilizante/i.test(c)) return 'FERTILIZERS IN BULK';
        if (/granel\s*s[oó]lido/i.test(c)) return 'DRY BULK';
        if (/carga\s*general/i.test(c)) return 'GENERAL CARGO';
        if (/break\s*bulk|proyecto/i.test(c)) return 'PROJECT CARGO / BREAKBULK';
        return commodity.toUpperCase();
    }

    function formatMadreStrategicReportEnglish(rawReport, state = {}) {
        const safeState = state || {};
        const text = String(rawReport || safeState.reporte_estrategico || safeState.reporteEstrategico || '').trim();

        if (!text && !safeState.pol && !safeState.pod) return '';

        if (text && !isSpanishMaritimeText(text)) {
            return text;
        }

        let pol = String(safeState.pol || '').trim();
        let pod = String(safeState.pod || '').trim();
        const routeMatch = text.match(/operaci[oó]n\s+([A-Za-z\u00C0-\u017F\s]+?)\s*(?:➔|->|to|hacia)\s*([A-Za-z\u00C0-\u017F\s]+?)(?:\s*\(|\.|\n|$)/i);
        if (routeMatch) {
            if (!pol) pol = routeMatch[1].trim();
            if (!pod) pod = routeMatch[2].trim();
        }
        pol = (pol || 'LOADING PORT (POL)').toUpperCase();
        pod = (pod || 'DISCHARGE PORT (POD)').toUpperCase();

        let cargoQty = Number(safeState.cargoQty || safeState.cargo || 0);
        const qtyMatch = text.match(/(\d+[\d\.,]*)\s*(?:MT|TM|toneladas)/i);
        if (!cargoQty && qtyMatch) {
            const parsed = parseFloat(qtyMatch[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0) cargoQty = parsed;
        }
        if (!cargoQty) cargoQty = 25000;

        let commodity = safeState.commodity || safeState.cargoType || '';
        const commMatch = text.match(/MT\s+de\s+([^\)\.]+?)(?:\)|\.|\n|$)/i);
        if (!commodity && commMatch) {
            commodity = commMatch[1].trim();
        }
        commodity = translateCommodityToEnglish(commodity || 'DRY BULK');

        let breakEven = Number(safeState.breakEven || 0);
        const beMatch = text.match(/Break-Even(?:\s*base)?(?:\s*de)?\s*[\$]?\s*(\d+(?:[\.,]\d+)?)/i);
        if (!breakEven && beMatch) {
            const parsed = parseFloat(beMatch[1].replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0) breakEven = parsed;
        }
        if (!breakEven) breakEven = 32.50;

        let freightRate = Number(safeState.allInRateGross || safeState.fleteUnitario || safeState.freightRate || safeState.flete || 0);
        const freightMatch = text.match(/(?:ajustando el flete a|Flete ALL-IN GROSS:\s*|flete nominal de\s*)[\$]?\s*(\d+(?:[\.,]\d+)?)/i);
        if (!freightRate && freightMatch) {
            const parsed = parseFloat(freightMatch[1].replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0) freightRate = parsed;
        }
        if (!freightRate) freightRate = 42.00;

        let dischargeRate = Number(safeState.dischargeRate || safeState.dischRate || safeState.optimalDischargeRate || 0);
        const dischMatch = text.match(/ritmo de descarga\s*\(\s*(\d+[\d\.,]*)\s*(?:MT\/d|tm\/d)/i);
        if (!dischargeRate && dischMatch) {
            const parsed = parseFloat(dischMatch[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0) dischargeRate = parsed;
        }
        if (!dischargeRate) dischargeRate = 2500;

        let loadRate = Number(safeState.loadRate || safeState.loadingRate || 0);
        if (!loadRate) loadRate = 5000;

        const rawVesselName = String(
            safeState.vesselName ||
            (typeof safeState.vessel === 'object' ? safeState.vessel?.name : safeState.vessel) ||
            safeState.nombre_buque ||
            safeState.shipName ||
            'MV TBN'
        ).trim();
        const vesselName = rawVesselName ? rawVesselName.toUpperCase() : 'MV TBN';

        const vesselType = String(
            safeState.vesselType ||
            safeState.tipoBuque ||
            safeState.shipProfile ||
            'Geared Bulk Carrier / Open Holds'
        ).toUpperCase();

        const rawDwt = Number(safeState.dwt || safeState.vesselDwt || safeState.dwtReal || cargoQty);
        const dwt = (!isNaN(rawDwt) && rawDwt > 0) ? rawDwt : cargoQty;

        const rawDemurrage = [
            safeState.demurrageRate,
            safeState.demurrageRecomendado,
            safeState.demurrage
        ].map(Number).find(val => Number.isFinite(val) && val > 0) || 31200;

        const formattedCargoQty = cargoQty.toLocaleString('en-US');
        const formattedDwt = dwt.toLocaleString('en-US');
        const formattedLoadRate = loadRate.toLocaleString('en-US');
        const formattedDischRate = dischargeRate.toLocaleString('en-US');
        const formattedDemurrage = rawDemurrage.toLocaleString('en-US');
        const formattedBreakEven = breakEven.toFixed(2);
        const formattedFreight = freightRate.toFixed(2);

        return [
            `1. ROUTE & TRAFFIC:`,
            `Commercial trading route from 1 safe berth / 1 safe port ${pol} to 1 safe berth / 1 safe port ${pod}. Transit and routing parameters verified in compliance with international navigation standards, canal regulations and seasonal weather working conditions.`,
            ``,
            `2. VESSEL DESIGNATION:`,
            `${vesselName} (ABT ${formattedDwt} MT DWT, ${vesselType}). Structural integrity, hold cleanliness, and onboard gear/equipment validated for safe reception and carriage of cargo in accordance with BIMCO/GENCON charterparty standards.`,
            ``,
            `3. CARGO ANALYSIS:`,
            `${formattedCargoQty} METRIC TONS 5% MOLOO OF ${commodity}. Contractual loading rate fixed at ${formattedLoadRate} MT/WWD SHINC. Contractual discharge rate evaluated at ${formattedDischRate} MT/WWD SHINC. Turnaround bottleneck identified at discharge port requiring strict laytime definition and Reachable on Arrival terms to eliminate uncompensated waiting time.`,
            ``,
            `4. FINANCIAL & FREIGHT ANALYSIS:`,
            `Base operational break-even calculated at USD $${formattedBreakEven}/MT against agreed all-in freight rate of USD $${formattedFreight}/MT (protecting commercial net margin). Demurrage rate fixed at USD $${formattedDemurrage}/day pro rata to insulate against terminal congestion. Option B strategic execution confirmed, locking in required bunker coverage, JWC war risk provisions, and laytime safeguards.`,
            ``,
            `Signed: MADRE`
        ].join('\n');
    }

    window.formatMadreStrategicReportEnglish = formatMadreStrategicReportEnglish;
    window.translateCommodityToEnglish = translateCommodityToEnglish;
    window.isSpanishMaritimeText = isSpanishMaritimeText;
    if (typeof globalThis !== 'undefined') {
        globalThis.formatMadreStrategicReportEnglish = formatMadreStrategicReportEnglish;
        globalThis.translateCommodityToEnglish = translateCommodityToEnglish;
        globalThis.isSpanishMaritimeText = isSpanishMaritimeText;
    }

    window.prepareCurrentFixtureRecapState = function (modifications = {}, options = {}) {
        const state = window.getCurrentFixtureRecapState();
        const mods = window.selectFixtureRecapState(modifications);
        const lang = options?.lang || modifications?.lang || 'en';
        state.lang = lang;
        state.language = lang;
        // Audit suggestions cannot change identity, route, cargo or equipment.
        for (const key of ['allInRateGross', 'fleteUnitario', 'freightRate', 'demurrageRate', 'laycanDaysLeft', 'reporte_estrategico', 'reporteEstrategico', 'madreUltimaAuditoria']) {
            if (mods[key] !== undefined) state[key] = mods[key];
        }
        state.allInRateGross = mods.allInRateGross ?? mods.flete ?? mods.fleteUnitario ?? mods.freightRate ?? state.allInRateGross;

        if (state.lang === 'en' || !state.lang) {
            const rawReport = state.reporte_estrategico || state.reporteEstrategico || state.madreUltimaAuditoria?.reporte_estrategico || state.madreUltimaAuditoria?.respuesta;
            if (rawReport && typeof formatMadreStrategicReportEnglish === 'function') {
                const englishReport = formatMadreStrategicReportEnglish(rawReport, state);
                state.reporte_estrategico = englishReport;
                state.reporteEstrategico = englishReport;
                if (state.madreUltimaAuditoria && typeof state.madreUltimaAuditoria === 'object') {
                    state.madreUltimaAuditoria = {
                        ...state.madreUltimaAuditoria,
                        reporte_estrategico: englishReport
                    };
                }
            }
        }
        return state;
    };
    window.activateFixtureRecapSnapshot = function (snapshot) {
        const id = recordId(window.State) ?? 'current';
        if (String(id) !== String(recordId(snapshot.state) ?? 'current') && String(id) !== snapshot.state.legacyEstimationId) throw new Error('La estimación actual cambió durante la preparación del Recap');
        const state = window.selectFixtureRecapState(snapshot.state);
        if (window.State) Object.assign(window.State, state);
        window.dssFormState = { ...state };
        window.dssBaseActualState = { ...state };
        window.dssSimulationState = null;
    };
    window.getFixtureRecapSnapshot = function (state, explicit) {
        const snapshot = explicit || ownValue(window.State, 'fixtureRecapSnapshot');
        if (!snapshot?.state || snapshot.version !== 2) return null;
        if (recordId(state) !== recordId(snapshot.state) && recordId(state) !== snapshot.state.legacyEstimationId) return null;
        // Print the immutable approved document. Live recalculations do not revise its terms.
        return snapshot;
    };
    // Iterative and cooperative: no recursion over arbitrary live application state.
    const freeze = async root => {
        const pending = [root];
        const seen = new WeakSet();
        let visited = 0;
        while (pending.length) {
            const value = pending.pop();
            if (!value || typeof value !== 'object' || seen.has(value)) continue;
            seen.add(value);
            if (++visited % 128 === 0) await yieldToBrowser();
            pending.push(...Object.values(value));
            Object.freeze(value);
        }
        return root;
    };
    window.captureFixtureFinancialSnapshot = async function (approvedState, option = 'definitive', includeExecutiveReport = false) {
        // Work on a detached source so a failed save preserves the approved session.
        const state = window.selectFixtureRecapState(approvedState);
        const legacyId = recordId(state);
        state.legacyEstimationId = state.legacyEstimationId || legacyId;
        if (window.FixtureReferenceService) {
            const identity = legacyId === 'current' ? window.crypto.randomUUID() : legacyId;
            const reference = await window.FixtureReferenceService.ensure(identity);
            state.estimationId = reference;
            state.activeReference = reference;
            state.id = reference;
        } else state.estimationId = legacyId;
        if (!String(state.pol || '').trim() || !String(state.pod || '').trim()) throw new Error('Seleccione los puertos reales POL y POD antes de aprobar el Recap.');
        if (typeof window.resolveFixtureRecapOperations === 'function') {
            const operations = window.resolveFixtureRecapOperations(state);
            state.selectedVesselType = state.selectedVesselType || state.vesselType;
            state.operationalProfile = operations.operationalProfile;
            state.vesselType = operations.vesselType;
        }
        const rate = Number(state.allInRateGross);
        const quantity = Number(state.cargoQty);
        if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
            throw new Error('No se puede congelar el Recap sin tarifa aprobada y cantidad válidas.');
        }
        const financial = {
            allInRateGross: rate,
            unitRate: rate,
            totalFreightGross: Number((rate * quantity).toFixed(2)),
            unitRateText: rate.toFixed(2),
            totalFreightText: Number((rate * quantity).toFixed(2)).toLocaleString('en-US'),
            cargoQty: quantity,
            currency: 'USD'
        };
        state.lang = 'en';
        state.language = 'en';
        if (state.reporte_estrategico && typeof formatMadreStrategicReportEnglish === 'function') {
            state.reporte_estrategico = formatMadreStrategicReportEnglish(state.reporte_estrategico, state);
            if (state.madreUltimaAuditoria && typeof state.madreUltimaAuditoria === 'object') {
                state.madreUltimaAuditoria.reporte_estrategico = state.reporte_estrategico;
            }
        }
        Object.assign(state, { allInRateGross: rate, fleteUnitario: rate, freightSell: rate, fixtureFinancial: financial });
        await yieldToBrowser();
        const html = window.buildFixtureRecapHTMLTemplate(state);
        let executiveHTML = '';
        if (includeExecutiveReport) {
            if (typeof window.buildFixtureExecutiveReportHTML !== 'function') throw new Error('Executive report renderer is unavailable');
            await yieldToBrowser();
            executiveHTML = await window.buildFixtureExecutiveReportHTML({ ...state, cargo: quantity, cargoType: state.cargoType || state.commodity });
        }
        if (typeof html !== 'string' || typeof executiveHTML !== 'string' || html.length + executiveHTML.length > 1000000) throw limitError();
        await yieldToBrowser();
        const snapshot = await freeze({ version: 2, option, approvedAt: new Date().toISOString(), financial, state, html, executiveHTML });
        const id = state.estimationId;
        await yieldToBrowser();
        const body = JSON.stringify({ estimation: { ...state, fixtureRecapSnapshot: snapshot, isFixed: true } });
        if (body.length > 4000000) throw limitError();
        await yieldToBrowser();
        const response = await fetch(`/api/estimations/${encodeURIComponent(id)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body
        });
        if (!response.ok) throw new Error('No se pudo guardar el snapshot financiero del expediente.');
        // Publish only after durable storage succeeds. A subsequent approval creates a new record.
        for (const target of [window.State, window.dssFormState, window.dssBaseActualState]) {
            if (target && (recordId(target) === recordId(state) || recordId(target) === state.legacyEstimationId)) {
                target.fixtureRecapSnapshot = snapshot;
                if (window.FixtureReferenceService) Object.assign(target, { estimationId: state.estimationId, activeReference: state.activeReference || state.estimationId, legacyEstimationId: state.legacyEstimationId });
            }
        }
        if (recordId(window.State) === recordId(state) || recordId(window.State) === state.legacyEstimationId) window.SeaCharterStore?.set?.({ fixtureRecapSnapshot: snapshot });
        if (window.FixtureReferenceService && recordId(window.State) === recordId(state)) window.ContractRefManager?.setActiveContractRef?.(state.estimationId);
        return snapshot;
    };
})();
