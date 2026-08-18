import { voyageStore } from './stores/voyage-store.js';
import { applyVoyageScenarioDefaults } from '../shared/voyage-scenario-policy.mjs';

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

function setPortSelectionWarning(inputId, value, needsSelection) {
    const input = document.getElementById(inputId);
    if (!input) return false;
    const anchor = input.closest('.port-autocomplete-anchor') || input.parentElement;
    const warningId = `${inputId}-nlp-port-warning`;
    let warning = document.getElementById(warningId);
    input.classList.toggle('border-amber-400', needsSelection);
    input.classList.toggle('bg-amber-50', needsSelection);
    input.setAttribute('aria-invalid', needsSelection ? 'true' : 'false');
    if (!needsSelection) {
        warning?.remove();
        return true;
    }
    setValue(inputId, value);
    if (!warning) {
        warning = document.createElement('small');
        warning.id = warningId;
        warning.className = 'nlp-port-validation-warning mt-1 block text-xs font-semibold text-amber-700';
        warning.setAttribute('role', 'alert');
        anchor?.appendChild(warning);
    }
    warning.textContent = 'Puerto no validado exactamente. Selecciona una opción del catálogo WPI.';
    input.focus();
    return true;
}

function cleanNlpPortName(value) {
    const name = String(value || '').trim();
    return /^(?:POL|POD)$/i.test(name) ? '' : name;
}

function hasScenarioTextValue(scenario, keys) {
    return keys.some((key) => String(scenario?.[key] ?? '').trim().length > 0);
}

function hasScenarioPositiveNumber(scenario, keys) {
    return keys.some((key) => Number(scenario?.[key]) > 0);
}

function injectVoyageScenario(incomingScenario = {}) {
    const previousDraft = voyageStore.getState().draft;
    const incomingPol = cleanNlpPortName(incomingScenario.pol);
    const incomingPod = cleanNlpPortName(incomingScenario.pod);
    const hasIncomingRoute = Boolean(incomingPol || incomingPod || incomingScenario.pol_port || incomingScenario.pod_port);
    const shouldApplyRouteDefaults = Boolean(incomingPol && incomingPod);
    const scenario = shouldApplyRouteDefaults
        ? applyVoyageScenarioDefaults(incomingScenario)
        : { ...incomingScenario, is_partial: true };
    const shouldApplyCargoQuantity = shouldApplyRouteDefaults || hasScenarioPositiveNumber(incomingScenario, ['cargo_qty', 'cargoQty']);
    const shouldApplyCargoType = shouldApplyRouteDefaults || hasScenarioTextValue(incomingScenario, ['cargo_type', 'cargoType']);
    const shouldApplyLaydays = shouldApplyRouteDefaults || hasScenarioTextValue(incomingScenario, ['laydays']);
    const shouldApplyCancelling = shouldApplyRouteDefaults || hasScenarioTextValue(incomingScenario, ['cancelling']);
    const shouldApplyLoadingRate = hasScenarioPositiveNumber(incomingScenario, ['loading_rate', 'loadingRate']);
    const shouldApplyDischargeRate = hasScenarioPositiveNumber(incomingScenario, ['discharge_rate', 'dischargeRate']);
    const pol = cleanNlpPortName(scenario.pol) || previousDraft.pol?.name || '';
    const pod = cleanNlpPortName(scenario.pod) || previousDraft.pod?.name || '';
    const cargoQuantity = shouldApplyCargoQuantity
        ? Number(scenario.cargo_qty ?? scenario.cargoQty) || 0
        : Number(previousDraft.cargo?.quantityMt) || 0;
    const cargoType = shouldApplyCargoType
        ? String(scenario.cargo_type || scenario.cargoType || '').trim()
        : String(previousDraft.cargo?.description || '').trim();
    const laydays = shouldApplyLaydays
        ? String(scenario.laydays || '').trim()
        : String(previousDraft.laycan?.laydays || '').trim();
    const cancelling = shouldApplyCancelling
        ? String(scenario.cancelling || laydays).trim()
        : String(previousDraft.laycan?.cancelling || laydays).trim();
    const loadingRate = Number(scenario.loading_rate ?? scenario.loadingRate) || 0;
    const dischargeRate = Number(scenario.discharge_rate ?? scenario.dischargeRate) || 0;
    const hasValidatedPol = Boolean(scenario.pol_port);
    const hasValidatedPod = Boolean(scenario.pod_port);
    if (incomingPol || scenario.pol_port) {
        ['port-pol', 'map-port-pol'].forEach((inputId) => {
            if (hasValidatedPol) selectValidatedWpiPort(inputId, scenario.pol_port);
            setPortSelectionWarning(inputId, pol, !hasValidatedPol);
        });
    }
    if (incomingPod || scenario.pod_port) {
        ['port-pod', 'map-port-pod'].forEach((inputId) => {
            if (hasValidatedPod) selectValidatedWpiPort(inputId, scenario.pod_port);
            setPortSelectionWarning(inputId, pod, !hasValidatedPod);
        });
    }

    voyageStore.getState().applyNlpScenario({
        ...(incomingPol || scenario.pol_port ? { pol: incomingPol, pol_port: scenario.pol_port } : {}),
        ...(incomingPod || scenario.pod_port ? { pod: incomingPod, pod_port: scenario.pod_port } : {}),
        ...(shouldApplyCargoQuantity ? { cargo_qty: cargoQuantity } : {}),
        ...(shouldApplyCargoType ? { cargo_type: cargoType } : {}),
        ...(shouldApplyLaydays ? { laydays } : {}),
        ...(shouldApplyCancelling ? { cancelling } : {}),
        ...(shouldApplyLoadingRate ? { loading_rate: loadingRate } : {}),
        ...(shouldApplyDischargeRate ? { discharge_rate: dischargeRate } : {}),
    });

    if (incomingPol || scenario.pol_port) window.syncSelectedRoutePort?.('POL', pol);
    if (incomingPod || scenario.pod_port) window.syncSelectedRoutePort?.('POD', pod);
    if (shouldApplyCargoQuantity) setValue('cargo-qty', cargoQuantity);
    if (shouldApplyCargoType) setSelectValue('cargo-product', cargoType);
    if (shouldApplyLaydays) {
        ['map-laycan-date', 'gc-laycan-date', 'asb-laycan-date', 'match-laycan-start'].forEach((id) => setValue(id, laydays));
    }
    if (shouldApplyCancelling) {
        ['map-cancelling-date', 'gc-cancel-date', 'asb-cancel-date', 'match-laycan-end'].forEach((id) => setValue(id, cancelling));
    }
    if (shouldApplyLoadingRate) {
        setValue('rate-load', loadingRate);
        setValue('ritmo_nominal_pol', loadingRate);
    }
    if (shouldApplyDischargeRate) {
        setValue('rate-disch', dischargeRate);
        setValue('ritmo_nominal_pod', dischargeRate);
    }
    if (scenario.loading_terms) {
        ['laytime-load-condition', 'gc-laytime-load-cond'].forEach((id) => setSelectValue(id, scenario.loading_terms));
    }
    if (scenario.discharge_terms) {
        ['laytime-disch-condition', 'gc-laytime-disch-cond'].forEach((id) => setSelectValue(id, scenario.discharge_terms));
    }

    const previousCalculatorState = window.SeaCharterStore?.getState?.() || {};
    const calculatorState = {
        ...previousCalculatorState,
        ...(incomingPol || scenario.pol_port ? { pol } : {}),
        ...(incomingPod || scenario.pod_port ? { pod } : {}),
        ...(shouldApplyLaydays ? { laydays, laycanDate: laydays } : {}),
        ...(shouldApplyCancelling ? { cancelling, cancellingDate: cancelling } : {}),
        laycan: {
            ...(previousCalculatorState.laycan || {}),
            ...(shouldApplyLaydays ? { laydays } : {}),
            ...(shouldApplyCancelling ? { cancelling } : {}),
        },
        ...(shouldApplyCargoQuantity
            ? { cargoQuantity, cargoQty: cargoQuantity, cargo: cargoQuantity }
            : {}),
        ...(shouldApplyCargoType
            ? { cargoProduct: cargoType, cargoType }
            : {}),
        ...(scenario.loading_terms ? { laytimeLoadCondition: scenario.loading_terms } : {}),
        ...(scenario.discharge_terms ? { laytimeDischCondition: scenario.discharge_terms } : {}),
        ...(shouldApplyLoadingRate ? { loadRate: loadingRate, ritmoRealPol: loadingRate } : {}),
        ...(shouldApplyDischargeRate ? { dischargeRate, dischRate: dischargeRate, ritmoRealPod: dischargeRate } : {}),
    };
    window.SeaCharterStore?.set?.(calculatorState, { force: true, source: 'assistant-nlp' });
    window.updateGlobalVoyageParams?.(calculatorState, { source: 'assistant-nlp' });
    window.dispatchEvent(new CustomEvent('voyage-draft:nlp-injected', { detail: { scenario, draft: voyageStore.getState().draft } }));
    if (typeof window.syncGlobalStateToForms === 'function') window.syncGlobalStateToForms();
    const requiresPortSelection = hasIncomingRoute && (!hasValidatedPol || !hasValidatedPod);
    if (hasIncomingRoute && !requiresPortSelection && scenario.is_partial) {
        void window.runOnDemandMapRouteWorkflow?.(document.getElementById('btn-map-locate-route'));
    } else if (!requiresPortSelection && typeof window.runEngine === 'function') {
        window.runEngine();
    }
    return { draft: voyageStore.getState().draft, requiresPortSelection, routeOnly: hasIncomingRoute && scenario.is_partial };
}

function applyAssistantCalculatorAutofill(payload = {}) {
    const loadingRate = Number(payload.loading_rate ?? payload.loadingRate) || 0;
    const dischargeRate = Number(payload.discharge_rate ?? payload.dischargeRate) || 0;
    const requiredDwt = Number(payload.required_dwt ?? payload.requiredDwt) || 0;
    const vesselClass = String(payload.vessel_class || payload.vesselClass || '').trim();
    const loadingMethod = payload.loading_method || payload.loadingMethod || {};
    const dischargeMethod = payload.discharge_method || payload.dischargeMethod || {};
    const requestedCargoQuantity = Number(payload.cargo_qty ?? payload.cargoQty) || 0;
    const cargoInput = document.getElementById('cargo-qty');
    const currentCargoQuantity = Number(cargoInput?.value) || 0;
    const cargoQuantity = currentCargoQuantity > 0 ? currentCargoQuantity : requestedCargoQuantity;
    const cargoPreserved = currentCargoQuantity > 0;

    if (!loadingRate || !dischargeRate || !requiredDwt || !vesselClass) {
        throw new Error('Payload de autocompletado incompleto');
    }

    const applyUpdates = () => {
        if (!cargoPreserved && cargoQuantity > 0) setValue('cargo-qty', cargoQuantity);
        if (!readElementText('cargo-product') && payload.cargo_type) setSelectValue('cargo-product', payload.cargo_type);

        setValue('vessel-dwt', requiredDwt);
        setSelectValue('metodo_carga', loadingMethod.value || loadingMethod.label);
        setSelectValue('metodo_descarga_pod', dischargeMethod.value || dischargeMethod.label);
        window.setRitmoMode?.('manual', 'pol', { commit: true, deferCalculations: true });
        window.setRitmoMode?.('manual', 'pod', { commit: true, deferCalculations: true });
        setValue('rate-load', loadingRate);
        setValue('rate-disch', dischargeRate);

        const vesselBadge = document.getElementById('vessel-badge');
        if (vesselBadge) vesselBadge.textContent = vesselClass;
        const cargoClassDisplay = document.getElementById('cargo-vessel-class-display');
        if (cargoClassDisplay) cargoClassDisplay.textContent = `Clasificado como: ${vesselClass}`;

        window.SeaCharterStore?.set?.({
            cargoQuantity,
            cargoQty: cargoQuantity,
            cargo: cargoQuantity,
            cargoProduct: String(payload.cargo_type || '').trim(),
            cargoType: String(payload.cargo_type || '').trim(),
            dwt: requiredDwt,
            vesselDwt: requiredDwt,
            class: vesselClass,
            loadRate: loadingRate,
            ritmoRealPol: loadingRate,
            dischargeRate,
            dischRate: dischargeRate,
            ritmoRealPod: dischargeRate,
            loadMethod: String(loadingMethod.label || loadingMethod.value || '').trim(),
            dischargeMethod: String(dischargeMethod.label || dischargeMethod.value || '').trim(),
            ritmoMode: 'manual',
            ritmoMode_pol: 'manual',
            ritmoMode_pod: 'manual',
            podCalcMode: 'manual',
        }, { force: true, source: 'assistant-calculator-autofill' });
    };
    if (typeof window.SeaCharterStore?.batch === 'function') {
        window.SeaCharterStore.batch(applyUpdates);
    } else {
        applyUpdates();
    }

    window.updateCargoVesselClassDisplay?.();
    window.syncGlobalStateToForms?.();
    window.recalcularDiasPuerto?.();
    window.runEngine?.();
    window.dispatchEvent(new CustomEvent('calculator:assistant-autofilled', {
        detail: { payload, cargoQuantity, cargoPreserved },
    }));
    return { applied: true, cargoQuantity, cargoPreserved };
}

function readElementText(id) {
    const element = document.getElementById(id);
    return String(element?.value || element?.textContent || '').trim();
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
window.applyAssistantCalculatorAutofill = applyAssistantCalculatorAutofill;
if (typeof window.SeaCharterStore?.subscribe === 'function' && !window.assistantOperationalDeductionSubscription) {
    window.assistantOperationalDeductionSubscription = window.SeaCharterStore.subscribe(
        (state) => [
            state.cargoQuantity ?? state.cargoQty ?? state.cargo,
            state.ritmoRealPol ?? state.loadRate,
            state.ritmoRealPod ?? state.dischargeRate ?? state.dischRate,
        ],
        () => {
            window.updateCargoVesselClassDisplay?.();
            window.recalcularDiasPuerto?.();
        },
        (current, next) => current.every((value, index) => Object.is(value, next[index])),
    );
}
window.addEventListener('sea-assistant:calculator-autofill', (event) => {
    if (!event?.detail?.payload) return;
    event.detail.result = applyAssistantCalculatorAutofill(event.detail.payload);
});

bindCalculatorStore();
bindManualBallastDistance();
voyageStore.subscribe((state, previousState) => {
    if (state.draft !== previousState.draft) hydrateCalculatorFromDraft(state.draft);
    if (state.draft?.weather !== previousState.draft?.weather && typeof window.runEngine === 'function') {
        window.runEngine();
    }
});
