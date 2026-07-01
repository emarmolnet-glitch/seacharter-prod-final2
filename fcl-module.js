// =============================================================================
// SeaCharter Core PRO - Modulo de Contenedores FCL/LCL
// -----------------------------------------------------------------------------
// Vanilla JavaScript autocontenido. Para conectar SeaCharter Data Bridge en el
// futuro, sustituir los valores de lectura en getFCLState() por datos externos
// o hidratar los inputs antes de llamar a updateContainerQuote().
// =============================================================================

(function initSeaCharterContainerModule() {
    const moduleId = 'seacharter-fcl-module';

    const ids = {
        mode: 'fcl-cargo-mode',
        fclPanel: 'fcl-panel',
        fclCostsPanel: 'fcl-costs-panel',
        lclPanel: 'lcl-panel',
        incoterm: 'fcl-incoterm',
        equipmentQty: 'fcl-equipment-qty',
        bas: 'fcl-bas',
        baf: 'fcl-baf',
        originThc: 'fcl-origin-thc',
        originCustoms: 'fcl-origin-customs',
        destinationThc: 'fcl-destination-thc',
        lclWeight: 'lcl-weight-tons',
        lclVolume: 'lcl-volume-cbm',
        lclWmRate: 'lcl-wm-rate',
        lclRevenueTons: 'lcl-revenue-tons',
        freeDays: 'dem-free-days',
        usedDays: 'dem-used-days',
        tier1Rate: 'dem-tier1-rate',
        tier1Limit: 'dem-tier1-limit',
        tier2Rate: 'dem-tier2-rate',
        demurrageCost: 'demurrage-cost',
        freightSubtotal: 'freight-subtotal',
        total: 'fcl-quote-total'
    };

    const originExcludedIncoterms = new Set(['FOB', 'CFR', 'CIF']);

    function getElement(id) {
        return document.getElementById(id);
    }

    function readMoney(id) {
        const value = Number.parseFloat(getElement(id)?.value);
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    function readPositiveNumber(id) {
        const value = Number.parseFloat(getElement(id)?.value);
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    function readWholeNumber(id) {
        const value = Number.parseInt(getElement(id)?.value, 10);
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    function readEquipmentQty() {
        const value = Number.parseInt(getElement(ids.equipmentQty)?.value, 10);
        return Number.isFinite(value) && value >= 1 ? value : 1;
    }

    function formatQuote(value) {
        return value.toLocaleString('es-ES', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function getFCLState() {
        // Punto de integracion futuro: mapear aqui tarifas recibidas desde SeaCharter Data Bridge.
        return {
            incoterm: getElement(ids.incoterm)?.value || 'EXW',
            equipmentQty: readEquipmentQty(),
            bas: readMoney(ids.bas),
            baf: readMoney(ids.baf),
            originThc: readMoney(ids.originThc),
            originCustoms: readMoney(ids.originCustoms),
            destinationThc: readMoney(ids.destinationThc)
        };
    }

    function getLCLState() {
        // Punto de integracion futuro: mapear aqui peso, volumen y tarifa W/M desde SeaCharter Data Bridge.
        return {
            weightTons: readPositiveNumber(ids.lclWeight),
            volumeCbm: readPositiveNumber(ids.lclVolume),
            wmRate: readMoney(ids.lclWmRate)
        };
    }

    function getDemurrageState() {
        return {
            freeDays: readWholeNumber(ids.freeDays),
            usedDays: readWholeNumber(ids.usedDays),
            tier1Rate: readMoney(ids.tier1Rate),
            tier1Limit: readWholeNumber(ids.tier1Limit),
            tier2Rate: readMoney(ids.tier2Rate)
        };
    }

    function setOriginFieldsState(shouldDisable) {
        document.querySelectorAll(`#${moduleId} [data-origin-controlled]`).forEach((field) => {
            if (shouldDisable) {
                field.value = '0';
            }
            field.disabled = shouldDisable;
            field.closest('[data-origin-cost]')?.classList.toggle('is-disabled', shouldDisable);
        });
    }

    function setModeVisibility(mode) {
        getElement(ids.fclPanel)?.classList.toggle('is-hidden', mode !== 'FCL');
        getElement(ids.fclCostsPanel)?.classList.toggle('is-hidden', mode !== 'FCL');
        getElement(ids.lclPanel)?.classList.toggle('is-hidden', mode !== 'LCL');
    }

    function calculateFCLQuote(state) {
        const perContainerCosts = state.bas + state.baf + state.originThc + state.destinationThc;
        return (perContainerCosts * state.equipmentQty) + state.originCustoms;
    }

    function calculateLCLQuote(state) {
        const revenueTons = Math.max(state.weightTons, state.volumeCbm);
        return {
            revenueTons,
            total: revenueTons * state.wmRate
        };
    }

    function calculateDemurrage(state) {
        const extraDays = Math.max(0, state.usedDays - state.freeDays);
        const tier1Days = Math.min(extraDays, state.tier1Limit);
        const tier2Days = Math.max(0, extraDays - state.tier1Limit);

        return {
            extraDays,
            tier1Days,
            tier2Days,
            total: (tier1Days * state.tier1Rate) + (tier2Days * state.tier2Rate)
        };
    }

    function updateContainerQuote() {
        const mode = getElement(ids.mode)?.value || 'FCL';
        setModeVisibility(mode);

        const incoterm = getElement(ids.incoterm)?.value || 'EXW';
        setOriginFieldsState(originExcludedIncoterms.has(incoterm));

        const fclState = getFCLState();
        const lclState = getLCLState();
        const demurrageState = getDemurrageState();
        const lclQuote = calculateLCLQuote(lclState);
        const freightTotal = mode === 'FCL' ? calculateFCLQuote(fclState) : lclQuote.total;
        const demurrage = calculateDemurrage(demurrageState);
        const total = freightTotal + demurrage.total;

        const revenueTonsOutput = getElement(ids.lclRevenueTons);
        if (revenueTonsOutput) {
            revenueTonsOutput.value = `${lclQuote.revenueTons.toFixed(2)} Revenue Tons`;
        }

        const freightOutput = getElement(ids.freightSubtotal);
        if (freightOutput) {
            freightOutput.textContent = formatQuote(freightTotal);
        }

        const demurrageOutput = getElement(ids.demurrageCost);
        if (demurrageOutput) {
            demurrageOutput.value = formatQuote(demurrage.total);
        }

        const output = getElement(ids.total);

        if (output) {
            output.textContent = formatQuote(total);
        }

        // Punto de integracion futuro: emitir este estado hacia SeaCharter Data Bridge si se requiere sincronizacion.
        window.SeaCharterFCLState = Object.freeze({
            mode,
            fcl: fclState,
            lcl: { ...lclState, revenueTons: lclQuote.revenueTons },
            demurrage,
            freightTotal,
            total
        });
    }

    function bindFCLModule() {
        const root = getElement(moduleId);
        if (!root) return;

        root.querySelectorAll('[data-fcl-input]').forEach((field) => {
            field.addEventListener('input', updateContainerQuote);
            field.addEventListener('change', updateContainerQuote);
        });

        updateContainerQuote();
    }

    window.updateFCLQuote = updateContainerQuote;
    window.updateContainerQuote = updateContainerQuote;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindFCLModule);
    } else {
        bindFCLModule();
    }
}());
