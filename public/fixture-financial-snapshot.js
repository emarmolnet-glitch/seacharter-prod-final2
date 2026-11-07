/* Capture once at approval. Exporters consume this record without consulting live pricing. */
(function () {
    const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 20));
    const limitError = () => new Error('El estado del Fixture Recap supera los límites de preparación. Reduzca los datos del expediente.');
    // Fixed contract/report schema. Never enumerate or clone application state.
    // Aliases are retained because both legacy Recap templates and the executive
    // report consume them. Charts, custom stowage plans and caches are excluded.
    const fields = `
        id estimationId activeReference legacyEstimationId selectedVesselType operationalProfile pol pod cargoQty cargo commodity cargoType
        allInRateGross fleteGross fleteEstimado fleteUnitario freightSell freightRate flete
        vesselName vesselType vessel vesselDwt dwt dwt_real dwtReal nombre_buque shipName
        shipProfile ship_profile vessel_type vessel_class vesselClass class shipClass
        designCategory design_category categoriaDiseno tipoBuque
        loadRate loadingRate ratePOL dischargeRate dischRate ratePOD
        optimalDischargeRate ritmoDescargaOptimizado ritmo_descarga_optimizado dssFormState madreUltimaAuditoria reporte_estrategico reporteEstrategico
        loadingMethod methodPOL loading_method loadMethod
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
    const labelFields = new Set(['productoEspecifico', 'cargoProduct', 'cargo_product', 'loadingMethod', 'methodPOL', 'loading_method', 'loadMethod']);
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
        if (typeof document !== 'undefined') {
            const activeLoadMethodPill = document.querySelector('#pills_metodo_carga .method-pill-active, #pills_metodo_carga [aria-pressed="true"], #pills_metodo_carga [data-active="true"]');
            const selectLoadEl = document.getElementById('metodo_carga');
            const activeLoadMethod = activeLoadMethodPill?.textContent?.trim() || selectLoadEl?.selectedOptions?.[0]?.textContent?.trim() || selectLoadEl?.value;
            if (activeLoadMethod) {
                state.loadingMethod = activeLoadMethod;
                state.methodPOL = activeLoadMethod;
                state.loading_method = activeLoadMethod;
                state.loadMethod = activeLoadMethod;
            }

            const activeDischMethodPill = document.querySelector('#pills_metodo_descarga .method-pill-active, #pills_metodo_descarga [aria-pressed="true"], #pills_metodo_descarga [data-active="true"]');
            const selectDischEl = document.getElementById('metodo_descarga_pod');
            const activeDischMethod = activeDischMethodPill?.textContent?.trim() || selectDischEl?.selectedOptions?.[0]?.textContent?.trim() || selectDischEl?.value;
            if (activeDischMethod) {
                state.dischargeMethod = activeDischMethod;
                state.methodPOD = activeDischMethod;
                state.discharge_method = activeDischMethod;
            }

            const domLoadRate = parseFloat(document.getElementById('rate-load')?.value || document.getElementById('input-loadRate')?.value);
            if (Number.isFinite(domLoadRate) && domLoadRate > 0) {
                state.loadRate = domLoadRate;
                state.ratePOL = domLoadRate;
            }

            const domDischRate = parseFloat(document.getElementById('rate-disch')?.value || document.getElementById('input-dischargeRate')?.value);
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
    window.prepareCurrentFixtureRecapState = function (modifications = {}) {
        const state = window.getCurrentFixtureRecapState();
        const mods = window.selectFixtureRecapState(modifications);
        // Audit suggestions cannot change identity, route, cargo or equipment.
        for (const key of ['allInRateGross', 'fleteUnitario', 'freightRate', 'demurrageRate', 'laycanDaysLeft', 'reporte_estrategico', 'reporteEstrategico', 'madreUltimaAuditoria']) {
            if (mods[key] !== undefined) state[key] = mods[key];
        }
        state.allInRateGross = mods.allInRateGross ?? mods.flete ?? mods.fleteUnitario ?? mods.freightRate ?? state.allInRateGross;
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
