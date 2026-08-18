import { voyageStore } from './stores/voyage-store.js';

let isHydratingBallastDistance = false;

function setValue(id, value) {
    const input = document.getElementById(id);
    if (!input || value === null || value === undefined || value === '') return;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelectValue(id, value) {
    const select = document.getElementById(id);
    const normalizedValue = String(value ?? '').trim();
    if (!select || !normalizedValue) return false;
    const comparableValue = normalizedValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const matchingOption = Array.from(select.options || []).find((option) => (
        option.value.localeCompare(normalizedValue, 'es', { sensitivity: 'base' }) === 0
        || option.textContent?.trim().localeCompare(normalizedValue, 'es', { sensitivity: 'base' }) === 0
        || option.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').includes(comparableValue)
        || comparableValue.includes(option.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es'))
    ));
    if (!matchingOption) return false;
    select.value = matchingOption.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function selectValidatedWpiPort(inputId, port) {
    const input = document.getElementById(inputId);
    if (!input || !port || port.source !== 'WPI' || typeof window.selectUniversalPortSuggestion !== 'function') return false;
    return window.selectUniversalPortSuggestion(input, {
        label: port.officialLabel,
        placeName: port.name,
        countryCode: port.countryCode,
        lat: Number(port.latitude),
        lon: Number(port.longitude),
        source: 'WPI',
        port: {
            indexNo: Number(port.indexNo) || null,
            regionNo: Number(port.regionNo) || null,
            countryCode: port.countryCode,
            source: 'WPI',
        },
    });
}

function injectVoyageScenario(scenario = {}) {
    const pol = String(scenario.pol || '').trim();
    const pod = String(scenario.pod || '').trim();
    const cargoQuantity = Number(scenario.cargo_qty ?? scenario.cargoQty) || 0;
    const cargoType = String(scenario.cargo_type || scenario.cargoType || '').trim();
    const laydays = String(scenario.laydays || '').trim();
    const cancelling = String(scenario.cancelling || laydays).trim();
    const loadingRate = Number(scenario.loading_rate ?? scenario.loadingRate) || 0;
    const dischargeRate = Number(scenario.discharge_rate ?? scenario.dischargeRate) || 0;
    if (
        scenario.port_validation?.valid !== true
        || pol !== scenario.pol_port?.officialLabel
        || pod !== scenario.pod_port?.officialLabel
    ) {
        throw new Error('POL y POD no están validados contra WPI.');
    }
    const selectedPorts = [
        selectValidatedWpiPort('port-pol', scenario.pol_port),
        selectValidatedWpiPort('map-port-pol', scenario.pol_port),
        selectValidatedWpiPort('port-pod', scenario.pod_port),
        selectValidatedWpiPort('map-port-pod', scenario.pod_port),
    ];
    if (selectedPorts.some((selected) => !selected)) throw new Error('No se pudieron consolidar los puertos WPI.');

    voyageStore.getState().applyNlpScenario({
        pol,
        pod,
        cargo_qty: cargoQuantity,
        cargo_type: cargoType,
        laydays,
        cancelling,
    });

    window.syncSelectedRoutePort?.('POL', pol);
    window.syncSelectedRoutePort?.('POD', pod);
    setValue('cargo-qty', cargoQuantity);
    setSelectValue('cargo-product', cargoType);
    ['map-laycan-date', 'gc-laycan-date', 'asb-laycan-date', 'match-laycan-start'].forEach((id) => setValue(id, laydays));
    ['map-cancelling-date', 'gc-cancel-date', 'asb-cancel-date', 'match-laycan-end'].forEach((id) => setValue(id, cancelling));
    setValue('rate-load', loadingRate);
    setValue('ritmo_nominal_pol', loadingRate);
    setValue('rate-disch', dischargeRate);
    setValue('ritmo_nominal_pod', dischargeRate);

    const calculatorState = {
        pol,
        pod,
        laydays,
        laycanDate: laydays,
        cancelling,
        cancellingDate: cancelling,
        laycan: { laydays, cancelling },
        cargoQuantity,
        cargoQty: cargoQuantity,
        cargo: cargoQuantity,
        cargoProduct: cargoType,
        cargoType,
        ...(loadingRate > 0 ? { loadRate: loadingRate } : {}),
        ...(dischargeRate > 0 ? { dischargeRate, dischRate: dischargeRate } : {}),
    };
    window.SeaCharterStore?.set?.(calculatorState, { force: true, source: 'assistant-nlp' });
    window.updateGlobalVoyageParams?.(calculatorState, { source: 'assistant-nlp' });
    window.dispatchEvent(new CustomEvent('voyage-draft:nlp-injected', { detail: { scenario, draft: voyageStore.getState().draft } }));
    if (typeof window.syncGlobalStateToForms === 'function') window.syncGlobalStateToForms();
    if (typeof window.runEngine === 'function') window.runEngine();
    return voyageStore.getState().draft;
}

function hydrateCalculatorFromDraft(draft) {
    const retainedBallastDistance = Number(draft?.ballastDistanceNm);
    const hasRetainedBallastDistance = Number.isFinite(retainedBallastDistance)
        && retainedBallastDistance >= 0
        && Boolean(draft?.ballastDistanceSource);
    if (hasRetainedBallastDistance) {
        const input = document.getElementById('dist-ballast');
        const currentDistance = Number(input?.value);
        if (!Number.isFinite(currentDistance) || currentDistance !== retainedBallastDistance) {
            isHydratingBallastDistance = true;
            try {
                setValue('dist-ballast', retainedBallastDistance);
            } finally {
                isHydratingBallastDistance = false;
            }
        }
        window.SeaCharterStore?.set?.({
            distBallast: retainedBallastDistance,
        }, { source: 'voyage-draft-ballast-restore', silent: true });
    }

    if (draft?.lastSource !== 'tracking-audit') return;
    const vessel = draft.vessel || {};
    setValue('nombre-buque-calculadora', vessel.name);
    setValue('vessel-identity-imo', vessel.imo);
    setValue('vessel-dwt', vessel.dwt);
    setValue('vessel-identity-dwt', vessel.dwt);
    setValue('vessel-identity-gt', vessel.gt);
    setValue('vessel-identity-flag', vessel.flag);
    setValue('vessel-identity-year', vessel.yearBuilt);

    window.SeaCharterStore?.set?.({
        vessel: vessel.name || '',
        vesselName: vessel.name || '',
        imo: vessel.imo || '',
        dwt: vessel.dwt || 0,
        gt: vessel.gt || 0,
        flag: vessel.flag || '',
        yearBuilt: vessel.yearBuilt || 0,
        distBallast: draft.ballastDistanceNm || 0,
    }, { source: 'tracking-audit', silent: true });
    window.dispatchEvent(new CustomEvent('voyage-draft:tracking-return', { detail: { draft } }));
}

function bindManualBallastDistance() {
    const input = document.getElementById('dist-ballast');
    if (!input) return;
    input.addEventListener('input', () => {
        if (isHydratingBallastDistance) return;
        const ballastDistanceNm = Number(input.value);
        if (!Number.isFinite(ballastDistanceNm) || ballastDistanceNm < 0) return;
        voyageStore.getState().setBallastDistance({
            ballastDistanceNm,
            source: 'calculator-manual',
        });
    });
}

function bindCalculatorStore() {
    const calculatorStore = window.SeaCharterStore;
    if (!calculatorStore?.getState || !calculatorStore?.subscribe) return;
    voyageStore.getState().updateFromCalculator(calculatorStore.getState());
    calculatorStore.subscribe((state) => {
        voyageStore.getState().updateFromCalculator(state);
    });
}

window.VoyageDraftStore = voyageStore;
window.useVoyageStore = voyageStore;
window.injectVoyageScenario = injectVoyageScenario;

bindCalculatorStore();
bindManualBallastDistance();
voyageStore.subscribe((state, previousState) => {
    if (state.draft !== previousState.draft) hydrateCalculatorFromDraft(state.draft);
    if (state.draft?.weather !== previousState.draft?.weather && typeof window.runEngine === 'function') {
        window.runEngine();
    }
});
