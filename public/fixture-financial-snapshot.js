/* Capture once at approval. Exporters consume this record without consulting live pricing. */
(function () {
    const freeze = value => {
        if (value && typeof value === 'object') {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    window.captureFixtureFinancialSnapshot = async function (approvedState, option = 'definitive', includeExecutiveReport = false) {
        const state = JSON.parse(JSON.stringify(approvedState));
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
        const html = window.buildFixtureRecapHTMLTemplate(state);
        let executiveHTML = '';
        if (includeExecutiveReport) {
            if (typeof window.buildFixtureExecutiveReportHTML !== 'function') throw new Error('Executive report renderer is unavailable');
            executiveHTML = await window.buildFixtureExecutiveReportHTML({ ...state, cargo: quantity, cargoType: state.commodity });
        }
        const snapshot = freeze({ version: 1, option, approvedAt: new Date().toISOString(), financial, state, html, executiveHTML });
        const id = state.estimationId || state.id || 'current';
        const response = await fetch(`/api/estimations/${encodeURIComponent(id)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estimation: { ...state, fixtureRecapSnapshot: snapshot, isFixed: true } })
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
