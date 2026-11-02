/* Capture once at approval. Exporters consume this record without consulting live pricing. */
(function () {
    const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 20));
    const limitError = () => new Error('El estado del Fixture Recap supera los límites de preparación. Reduzca los datos del expediente.');
    // Fixed contract/report schema. Never enumerate or clone application state.
    // Aliases are retained because both legacy Recap templates and the executive
    // report consume them. Charts, custom stowage plans and caches are excluded.
    const fields = `
        id estimationId activeReference pol pod cargoQty cargo commodity cargoType
        allInRateGross fleteGross fleteEstimado fleteUnitario freightSell freightRate
        vesselName vesselType vessel vesselDwt dwt dwt_real dwtReal nombre_buque shipName
        shipProfile ship_profile vessel_type vessel_class vesselClass class shipClass
        designCategory design_category categoriaDiseno tipoBuque
        loadRate loadingRate ratePOL dischargeRate ratePOD
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
    const clauseFields = new Set(['clausulas', 'specialClauses', 'clausulasEspeciales', 'clausulasEspecialesRecap']);
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
    window.selectFixtureRecapState = function (...sources) {
        const cleanState = {};
        for (const source of sources) {
            for (const key of fields) {
                let raw = ownValue(source, key);
                if (labelFields.has(key) && raw && typeof raw === 'object') {
                    raw = ownValue(raw, 'label') ?? ownValue(raw, 'value');
                }
                const value = primitive(raw, key);
                if (value !== undefined) cleanState[key] = value;
            }
            // Flatten only the three vessel identity fields; never retain its object.
            const vessel = ownValue(source, 'vessel');
            if (vessel && typeof vessel === 'object') {
                for (const [key, target] of [['name', 'vesselName'], ['type', 'vesselType'], ['dwt', 'dwt']]) {
                    const value = primitive(ownValue(vessel, key), target);
                    if (value !== undefined) cleanState[target] = value;
                }
            }
        }
        // Only the bounded primitive record is serialized, never a global source.
        if (JSON.stringify(cleanState).length > 32768) throw limitError();
        return cleanState;
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
        await yieldToBrowser();
        const state = window.selectFixtureRecapState(approvedState);
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
            executiveHTML = await window.buildFixtureExecutiveReportHTML({ ...state, cargo: quantity, cargoType: state.commodity });
        }
        if (typeof html !== 'string' || typeof executiveHTML !== 'string' || html.length + executiveHTML.length > 1000000) throw limitError();
        await yieldToBrowser();
        const snapshot = await freeze({ version: 1, option, approvedAt: new Date().toISOString(), financial, state, html, executiveHTML });
        const id = state.estimationId || state.id || 'current';
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
            if (target) target.fixtureRecapSnapshot = snapshot;
        }
        window.SeaCharterStore?.set?.({ fixtureRecapSnapshot: snapshot });
        return snapshot;
    };
})();
