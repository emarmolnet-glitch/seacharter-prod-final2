import { voyageStore } from './stores/voyage-store.js';
import { applyVoyageScenarioDefaults } from '../shared/voyage-scenario-policy.mjs';
import { normalizeNlpVoyagePayload } from '../shared/cargo-mapper.mjs';

let isHydratingBallastDistance = false;

function setValue(id, value, dispatchEvents = false) {
    const input = document.getElementById(id);
    if (!input || value === null || value === undefined || value === '') return;
    const nextVal = String(value);
    if (String(input.value) === nextVal) return;
    input.value = nextVal;
    if (dispatchEvents) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function setSelectValue(id, value, dispatchEvents = false) {
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
    if (select.value === matchingOption.value) return true;
    select.value = matchingOption.value;
    if (dispatchEvents) {
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
}

function replaceOperationalMethod(side, method) {
    const normalizedMethod = String(method || '').trim();
    if (!normalizedMethod) return false;
    const isPod = side === 'pod';
    const selectId = isPod ? 'metodo_descarga_pod' : 'metodo_carga';
    const stateValues = isPod
        ? { methodPOD: normalizedMethod, dischargeMethod: normalizedMethod, metodo_descarga_pod: normalizedMethod }
        : { methodPOL: normalizedMethod, loadMethod: normalizedMethod, metodo_carga: normalizedMethod };

    if (!window.State) window.State = {};
    Object.assign(window.State, stateValues);
    if (!window.section2LocalState || typeof window.section2LocalState !== 'object') window.section2LocalState = {};
    Object.assign(window.section2LocalState, stateValues, { [selectId]: normalizedMethod });

    const replaced = setSelectValue(selectId, normalizedMethod);
    window.renderMethodPills?.(side);
    return replaced;
}

function replaceCargoHierarchySelection(category, product) {
    const normalizedCategory = String(category || '').trim();
    const normalizedProduct = String(product || '').trim();
    if (!normalizedCategory || !normalizedProduct) return false;
    const stateValues = {
        cargoCategory: normalizedCategory,
        cargoType: normalizedCategory,
        categoriaCarga: normalizedCategory,
        cargoProduct: normalizedProduct,
        productoEspecifico: normalizedProduct,
    };

    if (!window.State) window.State = {};
    Object.assign(window.State, stateValues);
    if (!window.section2LocalState || typeof window.section2LocalState !== 'object') window.section2LocalState = {};
    Object.assign(window.section2LocalState, stateValues, {
        'cargo-type': normalizedCategory,
        'cargo-product': normalizedProduct,
    });

    if (typeof window.restoreCargoSelection === 'function') {
        window.restoreCargoSelection(normalizedCategory, normalizedProduct);
    } else {
        setSelectValue('cargo-type', normalizedCategory);
        window.populateCargoProducts?.(normalizedProduct);
        setSelectValue('cargo-product', normalizedProduct);
    }
    return document.getElementById('cargo-type')?.value === normalizedCategory
        && document.getElementById('cargo-product')?.value === normalizedProduct;
}

function waitForUiStateCommit() {
    return new Promise((resolve) => {
        const schedule = typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame.bind(window)
            : (callback) => window.setTimeout(callback, 0);
        schedule(() => schedule(resolve));
    });
}

async function finalizeAssistantVoyageInjection(injectionResult = {}, options = {}) {
    await Promise.resolve();
    await waitForUiStateCommit();
    window.renderMethodPills?.('pol');
    window.renderMethodPills?.('pod');

    if (injectionResult.hasIncomingRoute && (!injectionResult.requiresPortSelection || options.forceRouteCalculation)) {
        await window.runOnDemandMapRouteWorkflow?.(document.getElementById('btn-map-locate-route'));
    }

    await waitForUiStateCommit();
    if (typeof window.handleMasterValidationAndCalculate === 'function') {
        await window.handleMasterValidationAndCalculate();
    } else {
        window.recalcularDiasPuerto?.();
        window.runEngine?.();
    }
    return injectionResult;
}

function normalizeAssistantFormDate(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const match = text.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/);
    if (!match) return '';
    const isIsoOrder = match[1].length === 4;
    const year = Number(isIsoOrder ? match[1] : match[3]);
    const month = Number(match[2]);
    const day = Number(isIsoOrder ? match[3] : match[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function selectValidatedWpiPort(inputId, port) {
    const input = document.getElementById(inputId);
    if (!input || !port || port.source !== 'DATALASTIC' || typeof window.selectUniversalPortSuggestion !== 'function') return false;
    return window.selectUniversalPortSuggestion(input, {
        label: port.officialLabel,
        placeName: port.name,
        countryCode: port.countryCode,
        lat: Number(port.latitude),
        lon: Number(port.longitude),
        source: 'Datalastic',
        uuid: port.uuid,
        unlocode: port.unlocode,
        maxOperationalDraftMeters: port.maxOperationalDraftMeters,
        maxVesselLengthLabel: port.maxVesselLengthLabel || 'N/A',
        engineeringSource: port.engineeringSource || 'N/A',
        depthCode: port.depthCode || '',
        cargoDepth: port.cargoDepth || '',
        channelDepth: port.channelDepth || '',
        indexNo: port.indexNo || null,
        port: {
            uuid: port.uuid,
            unlocode: port.unlocode,
            countryCode: port.countryCode,
            source: 'DATALASTIC',
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

function readPositiveNumber(source, keys) {
    for (const key of keys) {
        const value = Number(source?.[key]);
        if (Number.isFinite(value) && value > 0) return value;
    }
    return 0;
}

function readMethodValue(value) {
    if (value && typeof value === 'object') return String(value.value || value.label || '').trim();
    return String(value || '').trim();
}

function resolveBigBagsMethod(cargoType, method) {
    return method || (/big\s*bags?/i.test(String(cargoType || '')) ? 'big_bags_barco' : '');
}

function applyManualOperationalRate(side, rate) {
    if (!(Number(rate) > 0)) return false;
    const isPod = side === 'pod';
    const inputId = isPod ? 'rate-disch' : 'rate-load';
    window.setRitmoMode?.('manual', side, { commit: true, deferCalculations: true });
    const input = document.getElementById(inputId);
    if (input) {
        input.readOnly = false;
        input.disabled = false;
        input.removeAttribute('readonly');
        input.removeAttribute('disabled');
        input.dataset.manualOverride = 'true';
        input.dataset.draftCalcMode = 'manual';
        if (isPod) input.dataset.podCalcMode = 'manual';
    }
    if (!window.State) window.State = {};
    window.State[`ritmoMode_${side}`] = 'manual';
    if (isPod) {
        window.State.podCalcMode = 'manual';
        window.State.dischRate = Number(rate);
    } else {
        window.State.ritmoMode = 'manual';
        window.State.loadRate = Number(rate);
    }
    setValue(inputId, rate);
    return true;
}

function injectVoyageScenario(incomingScenario = {}, options = {}) {
    incomingScenario = normalizeNlpVoyagePayload(incomingScenario);
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
    const shouldApplyCargoClassification = shouldApplyCargoType || hasScenarioTextValue(incomingScenario, [
        'cargo_category',
        'cargoCategory',
        'categoriaCarga',
        'cargo_product',
        'cargoProduct',
        'productoEspecifico',
        'cargo_specification',
        'cargoSpecification',
        'especificacionCargaId',
    ]);
    const shouldApplyLaydays = shouldApplyRouteDefaults || hasScenarioTextValue(incomingScenario, ['laydays']);
    const shouldApplyCancelling = shouldApplyRouteDefaults || hasScenarioTextValue(incomingScenario, ['cancelling']);
    const shouldApplyLoadingRate = hasScenarioPositiveNumber(incomingScenario, ['ratePOL', 'loading_rate', 'loadingRate']);
    const shouldApplyDischargeRate = hasScenarioPositiveNumber(incomingScenario, ['ratePOD', 'discharge_rate', 'dischargeRate']);
    const shouldApplyDwt = hasScenarioPositiveNumber(incomingScenario, ['dwt', 'required_dwt', 'requiredDwt']);
    const pol = cleanNlpPortName(scenario.pol) || previousDraft.pol?.name || '';
    const pod = cleanNlpPortName(scenario.pod) || previousDraft.pod?.name || '';
    const cargoQuantity = shouldApplyCargoQuantity
        ? Number(scenario.cargo_qty ?? scenario.cargoQty) || 0
        : Number(previousDraft.cargo?.quantityMt) || 0;
    const cargoType = shouldApplyCargoType
        ? String(scenario.cargo_type || scenario.cargoType || '').trim()
        : String(previousDraft.cargo?.description || '').trim();
    const cargoCategory = String(scenario.cargo_category || scenario.categoriaCarga || '').trim();
    const cargoProduct = String(scenario.cargo_product || scenario.productoEspecifico || cargoType).trim();
    const cargoSpecification = String(scenario.cargo_specification || scenario.especificacionCargaId || '100').trim();
    const laydays = shouldApplyLaydays
        ? String(scenario.laydays || '').trim()
        : String(previousDraft.laycan?.laydays || '').trim();
    const cancelling = shouldApplyCancelling
        ? String(scenario.cancelling || laydays).trim()
        : String(previousDraft.laycan?.cancelling || laydays).trim();
    const loadingRate = readPositiveNumber(scenario, ['ratePOL', 'loading_rate', 'loadingRate']);
    const dischargeRate = readPositiveNumber(scenario, ['ratePOD', 'discharge_rate', 'dischargeRate']);
    const dwt = readPositiveNumber(scenario, ['dwt', 'required_dwt', 'requiredDwt']);
    const methodPOL = resolveBigBagsMethod(`${cargoType} ${cargoProduct}`, readMethodValue(scenario.methodPOL ?? scenario.loading_method ?? scenario.loadingMethod ?? scenario.loadMethod));
    const methodPOD = readMethodValue(scenario.methodPOD ?? scenario.discharge_method ?? scenario.dischargeMethod) || methodPOL;
    const hasValidatedPol = Boolean(scenario.pol_port);
    const hasValidatedPod = Boolean(scenario.pod_port);

    const rawProjectCargo = scenario.projectCargo || scenario.project_cargo || {};
    const unitWeightMT = Number(rawProjectCargo.unitWeightMT ?? rawProjectCargo.unitWeight ?? rawProjectCargo.pesoUnitario ?? scenario.unitWeightMT ?? scenario.unitWeight ?? scenario.pesoUnitario) || 0;
    const length = Number(rawProjectCargo.dimensions?.lengthM ?? rawProjectCargo.dimensions?.length ?? rawProjectCargo.lengthM ?? rawProjectCargo.length ?? rawProjectCargo.largo ?? scenario.dimensions?.lengthM ?? scenario.dimensions?.length ?? scenario.lengthM ?? scenario.length ?? scenario.largo) || 0;
    const width = Number(rawProjectCargo.dimensions?.widthM ?? rawProjectCargo.dimensions?.width ?? rawProjectCargo.widthM ?? rawProjectCargo.width ?? rawProjectCargo.ancho ?? scenario.dimensions?.widthM ?? scenario.dimensions?.width ?? scenario.widthM ?? scenario.width ?? scenario.ancho) || 0;
    const height = Number(rawProjectCargo.dimensions?.heightM ?? rawProjectCargo.dimensions?.height ?? rawProjectCargo.heightM ?? rawProjectCargo.height ?? rawProjectCargo.alto ?? scenario.dimensions?.heightM ?? scenario.dimensions?.height ?? scenario.heightM ?? scenario.height ?? scenario.alto) || 0;
    const handlingMode = String(rawProjectCargo.handlingMode ?? scenario.handlingMode ?? rawProjectCargo.configuracionOperativa ?? scenario.configuracionOperativa ?? scenario.projectHandlingMode ?? 'direct-lift').trim();
    const hasProjectCargoData = Boolean(scenario.projectCargo || scenario.project_cargo || unitWeightMT > 0 || length > 0 || width > 0 || height > 0);

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
        ...(shouldApplyCargoType ? { cargo_type: cargoProduct || cargoType } : {}),
        ...(shouldApplyLaydays ? { laydays } : {}),
        ...(shouldApplyCancelling ? { cancelling } : {}),
        ...(shouldApplyLoadingRate ? { loading_rate: loadingRate } : {}),
        ...(shouldApplyDischargeRate ? { discharge_rate: dischargeRate } : {}),
        ...(shouldApplyDwt ? { dwt } : {}),
        ...(methodPOL ? { methodPOL } : {}),
        ...(methodPOD ? { methodPOD } : {}),
        ...(shouldApplyLoadingRate ? { ratePOL: loadingRate } : {}),
        ...(shouldApplyDischargeRate ? { ratePOD: dischargeRate } : {}),
        ...(hasProjectCargoData ? {
            projectCargo: {
                unitWeightMT,
                pesoUnitario: unitWeightMT,
                length,
                largo: length,
                width,
                ancho: width,
                height,
                alto: height,
                handlingMode,
                dimensions: {
                    lengthM: length,
                    widthM: width,
                    heightM: height,
                },
            },
            unitWeightMT,
            pesoUnitario: unitWeightMT,
            length,
            largo: length,
            width,
            ancho: width,
            height,
            alto: height,
            handlingMode,
        } : {}),
    });

    if (incomingPol || scenario.pol_port) window.syncSelectedRoutePort?.('POL', pol);
    if (incomingPod || scenario.pod_port) window.syncSelectedRoutePort?.('POD', pod);
    if (shouldApplyCargoQuantity) setValue('cargo-qty', cargoQuantity);
    if (shouldApplyCargoClassification && cargoSpecification) setSelectValue('cargo-type-manual', cargoSpecification);
    if (hasProjectCargoData) {
        setValue('project-unit-weight', unitWeightMT);
        setValue('project-length', length);
        setValue('project-width', width);
        setValue('project-height', height);
        setSelectValue('project-handling-mode', handlingMode);
        setValue('peso-pieza-mt', unitWeightMT);
    }
    if (shouldApplyLaydays) {
        ['map-laycan-date', 'gc-laycan-date', 'asb-laycan-date', 'match-laycan-start'].forEach((id) => setValue(id, laydays));
    }
    if (shouldApplyCancelling) {
        ['map-cancelling-date', 'gc-cancel-date', 'asb-cancel-date', 'match-laycan-end'].forEach((id) => setValue(id, cancelling));
    }
    if (shouldApplyDwt) setValue('vessel-dwt', dwt);
    if (shouldApplyLoadingRate) applyManualOperationalRate('pol', loadingRate);
    if (shouldApplyDischargeRate) applyManualOperationalRate('pod', dischargeRate);
    if (shouldApplyLoadingRate) setValue('ritmo_nominal_pol', loadingRate);
    if (shouldApplyDischargeRate) setValue('ritmo_nominal_pod', dischargeRate);
    if (scenario.laytimePOL || scenario.loading_terms) {
        ['laytime-load-condition', 'gc-laytime-load-cond'].forEach((id) => setSelectValue(id, scenario.laytimePOL || scenario.loading_terms));
    }
    if (scenario.laytimePOD || scenario.discharge_terms) {
        ['laytime-disch-condition', 'gc-laytime-disch-cond'].forEach((id) => setSelectValue(id, scenario.laytimePOD || scenario.discharge_terms));
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
        ...(shouldApplyCargoType ? { cargoDescription: cargoType } : {}),
        ...(scenario.laytimePOL || scenario.loading_terms ? { laytimePOL: scenario.laytimePOL || scenario.loading_terms, laytimeLoadCondition: scenario.laytimePOL || scenario.loading_terms } : {}),
        ...(scenario.laytimePOD || scenario.discharge_terms ? { laytimePOD: scenario.laytimePOD || scenario.discharge_terms, laytimeDischCondition: scenario.laytimePOD || scenario.discharge_terms } : {}),
        ...(shouldApplyCargoClassification && cargoCategory ? { cargoCategory, cargoType: cargoCategory } : {}),
        ...(shouldApplyCargoClassification && cargoProduct ? { cargoProduct } : {}),
        ...(shouldApplyCargoClassification && cargoSpecification ? { cargoSpecification } : {}),
        ...(hasProjectCargoData ? {
            pesoUnitario: unitWeightMT,
            unitWeightMT,
            largo: length,
            length,
            ancho: width,
            width,
            alto: height,
            height,
            handlingMode,
            projectHandlingMode: handlingMode,
            projectCargo: {
                unitWeightMT,
                pesoUnitario: unitWeightMT,
                length,
                largo: length,
                width,
                ancho: width,
                height,
                alto: height,
                handlingMode,
                dimensions: {
                    lengthM: length,
                    widthM: width,
                    heightM: height,
                },
            },
        } : {}),
        ...(shouldApplyLoadingRate ? { loadRate: loadingRate, ritmoRealPol: loadingRate } : {}),
        ...(shouldApplyDischargeRate ? { dischargeRate, dischRate: dischargeRate, ritmoRealPod: dischargeRate } : {}),
        ...(shouldApplyDwt ? { dwt, vesselDwt: dwt } : {}),
        ...(methodPOL ? { methodPOL, loadMethod: methodPOL } : {}),
        ...(methodPOD ? { methodPOD, dischargeMethod: methodPOD } : {}),
        ...(shouldApplyLoadingRate ? { ratePOL: loadingRate, ritmoMode: 'manual', ritmoMode_pol: 'manual' } : {}),
        ...(shouldApplyDischargeRate ? { ratePOD: dischargeRate, ritmoMode_pod: 'manual', podCalcMode: 'manual' } : {}),
    };
    window.SeaCharterStore?.set?.(calculatorState, { force: true, source: 'assistant-nlp' });
    window.updateGlobalVoyageParams?.(calculatorState, { source: 'assistant-nlp' });
    window.dispatchEvent(new CustomEvent('voyage-draft:nlp-injected', { detail: { scenario, draft: voyageStore.getState().draft } }));
    if (typeof window.syncGlobalStateToForms === 'function') window.syncGlobalStateToForms();
    if (hasProjectCargoData && typeof window.actualizarCamposTipoCarga === 'function') window.actualizarCamposTipoCarga();
    if (shouldApplyCargoClassification && cargoCategory && cargoProduct) replaceCargoHierarchySelection(cargoCategory, cargoProduct);
    if (methodPOL) replaceOperationalMethod('pol', methodPOL);
    if (methodPOD) replaceOperationalMethod('pod', methodPOD);
    if (shouldApplyLoadingRate) applyManualOperationalRate('pol', loadingRate);
    if (shouldApplyDischargeRate) applyManualOperationalRate('pod', dischargeRate);
    const requiresPortSelection = hasIncomingRoute && (!hasValidatedPol || !hasValidatedPod);
    if (!options.deferFinalActions && hasIncomingRoute && !requiresPortSelection) {
        void window.runOnDemandMapRouteWorkflow?.(document.getElementById('btn-map-locate-route'));
    } else if (!options.deferFinalActions && !requiresPortSelection && typeof window.runEngine === 'function') {
        window.runEngine();
    }
    return { draft: voyageStore.getState().draft, hasIncomingRoute, requiresPortSelection, routeOnly: hasIncomingRoute && scenario.is_partial };
}

async function applyAssistantCompleteForm(payload = {}) {
    const tonnage = Number(payload.tonnage ?? payload.cargo_qty ?? payload.cargoQty);
    const pol = String(payload.pol || '').trim();
    const pod = String(payload.pod || '').trim();
    if (!pol || !pod || !Number.isFinite(tonnage) || tonnage <= 0) {
        return { applied: false, reason: 'missing_route_or_tonnage' };
    }

    const laydays = normalizeAssistantFormDate(payload.laydayStart ?? payload.laydays);
    const cancelling = normalizeAssistantFormDate(payload.cancelling);
    const category = String(payload.category ?? payload.cargo_category ?? payload.cargoCategory ?? '').trim();
    const product = String(payload.product ?? payload.cargo_product ?? payload.cargoProduct ?? '').trim();
    const cargoDescription = String(payload.cargo_type ?? payload.cargoType ?? payload.mercancia ?? payload['mercancía'] ?? payload.commodity ?? '').trim();
    const loadingMethod = payload.loadingMethod ?? payload.loading_method ?? payload.methodPOL;
    const dischargeMethod = payload.dischargeMethod ?? payload.discharge_method ?? payload.methodPOD ?? loadingMethod;
    const scenario = {
        ...payload,
        pol,
        pod,
        cargo_qty: tonnage,
        cargoQty: tonnage,
        cargo_type: product || cargoDescription || category,
        cargo_category: category,
        cargo_product: product,
        laydays,
        cancelling,
        methodPOL: loadingMethod,
        methodPOD: dischargeMethod,
        loading_rate: Number(payload.loadingRate ?? payload.loading_rate) || 0,
        discharge_rate: Number(payload.dischargeRate ?? payload.discharge_rate) || 0,
    };
    const injectionResult = injectVoyageScenario(scenario, { deferFinalActions: true });
    await finalizeAssistantVoyageInjection(injectionResult, { forceRouteCalculation: true });
    window.dispatchEvent(new CustomEvent('calculator:assistant-complete-form-applied', {
        detail: { payload: scenario, draft: injectionResult.draft },
    }));
    return { ...injectionResult, applied: true };
}

function applyAssistantCalculatorAutofill(payload = {}) {
    payload = normalizeNlpVoyagePayload(payload);
    const loadingRate = readPositiveNumber(payload, ['ratePOL', 'loading_rate', 'loadingRate']);
    const dischargeRate = readPositiveNumber(payload, ['ratePOD', 'discharge_rate', 'dischargeRate']);
    const requiredDwt = readPositiveNumber(payload, ['dwt', 'required_dwt', 'requiredDwt']);
    const vesselClass = String(payload.vessel_class || payload.vesselClass || 'Buque recomendado').trim();
    const requestedCargoQuantity = Number(payload.cargo_qty ?? payload.cargoQty) || 0;
    const cargoInput = document.getElementById('cargo-qty');
    const currentCargoQuantity = Number(cargoInput?.value) || 0;
    const cargoQuantity = currentCargoQuantity > 0 ? currentCargoQuantity : requestedCargoQuantity;
    const cargoPreserved = currentCargoQuantity > 0;
    const cargoType = String(payload.cargo_type || payload.cargoType || '').trim();
    const cargoCategory = String(payload.cargo_category || payload.categoriaCarga || '').trim();
    const cargoProduct = String(payload.cargo_product || payload.productoEspecifico || cargoType).trim();
    const cargoSpecification = String(payload.cargo_specification || payload.especificacionCargaId || '100').trim();
    const loadingMethod = resolveBigBagsMethod(`${cargoType} ${cargoProduct}`, readMethodValue(payload.methodPOL ?? payload.loading_method ?? payload.loadingMethod));
    const dischargeMethod = readMethodValue(payload.methodPOD ?? payload.discharge_method ?? payload.dischargeMethod) || loadingMethod;

    const rawProjectCargo = payload.projectCargo || payload.project_cargo || {};
    const unitWeightMT = Number(rawProjectCargo.unitWeightMT ?? rawProjectCargo.unitWeight ?? rawProjectCargo.pesoUnitario ?? payload.unitWeightMT ?? payload.unitWeight ?? payload.pesoUnitario) || 0;
    const length = Number(rawProjectCargo.dimensions?.lengthM ?? rawProjectCargo.dimensions?.length ?? rawProjectCargo.lengthM ?? rawProjectCargo.length ?? rawProjectCargo.largo ?? payload.dimensions?.lengthM ?? payload.dimensions?.length ?? payload.lengthM ?? payload.length ?? payload.largo) || 0;
    const width = Number(rawProjectCargo.dimensions?.widthM ?? rawProjectCargo.dimensions?.width ?? rawProjectCargo.widthM ?? rawProjectCargo.width ?? rawProjectCargo.ancho ?? payload.dimensions?.widthM ?? payload.dimensions?.width ?? payload.widthM ?? payload.width ?? payload.ancho) || 0;
    const height = Number(rawProjectCargo.dimensions?.heightM ?? rawProjectCargo.dimensions?.height ?? rawProjectCargo.heightM ?? rawProjectCargo.height ?? rawProjectCargo.alto ?? payload.dimensions?.heightM ?? payload.dimensions?.height ?? payload.heightM ?? payload.height ?? payload.alto) || 0;
    const handlingMode = String(rawProjectCargo.handlingMode ?? payload.handlingMode ?? rawProjectCargo.configuracionOperativa ?? payload.configuracionOperativa ?? payload.projectHandlingMode ?? 'direct-lift').trim();
    const hasProjectCargoData = Boolean(payload.projectCargo || payload.project_cargo || unitWeightMT > 0 || length > 0 || width > 0 || height > 0);

    if (!loadingRate || !dischargeRate || !requiredDwt) {
        throw new Error('Payload de autocompletado incompleto');
    }

    const applyUpdates = () => {
        if (!cargoPreserved && cargoQuantity > 0) setValue('cargo-qty', cargoQuantity);
        if (cargoCategory) setSelectValue('cargo-type', cargoCategory);
        if (cargoProduct) setSelectValue('cargo-product', cargoProduct);
        if (cargoSpecification) setSelectValue('cargo-type-manual', cargoSpecification);

        if (hasProjectCargoData) {
            setValue('project-unit-weight', unitWeightMT);
            setValue('project-length', length);
            setValue('project-width', width);
            setValue('project-height', height);
            setSelectValue('project-handling-mode', handlingMode);
            setValue('peso-pieza-mt', unitWeightMT);
        }

        setValue('vessel-dwt', requiredDwt);
        setSelectValue('metodo_carga', loadingMethod);
        setSelectValue('metodo_descarga_pod', dischargeMethod);
        if (payload.laytimePOL) setSelectValue('laytime-load-condition', payload.laytimePOL);
        if (payload.laytimePOD) setSelectValue('laytime-disch-condition', payload.laytimePOD);
        applyManualOperationalRate('pol', loadingRate);
        applyManualOperationalRate('pod', dischargeRate);

        const vesselBadge = document.getElementById('vessel-badge');
        if (vesselBadge) vesselBadge.textContent = vesselClass;
        const cargoClassDisplay = document.getElementById('cargo-vessel-class-display');
        if (cargoClassDisplay) cargoClassDisplay.textContent = `Clasificado como: ${vesselClass}`;

        window.SeaCharterStore?.set?.({
            cargoQuantity,
            cargoQty: cargoQuantity,
            cargo: cargoQuantity,
            cargoCategory,
            cargoProduct,
            cargoSpecification,
            cargoType,
            ...(hasProjectCargoData ? {
                pesoUnitario: unitWeightMT,
                unitWeightMT,
                largo: length,
                length,
                ancho: width,
                width,
                alto: height,
                height,
                handlingMode,
                projectHandlingMode: handlingMode,
                projectCargo: {
                    unitWeightMT,
                    pesoUnitario: unitWeightMT,
                    length,
                    largo: length,
                    width,
                    ancho: width,
                    height,
                    alto: height,
                    handlingMode,
                    dimensions: {
                        lengthM: length,
                        widthM: width,
                        heightM: height,
                    },
                },
            } : {}),
            dwt: requiredDwt,
            vesselDwt: requiredDwt,
            class: vesselClass,
            loadRate: loadingRate,
            ritmoRealPol: loadingRate,
            dischargeRate,
            dischRate: dischargeRate,
            ritmoRealPod: dischargeRate,
            methodPOL: loadingMethod,
            methodPOD: dischargeMethod,
            loadMethod: loadingMethod,
            dischargeMethod,
            laytimePOL: payload.laytimePOL,
            laytimePOD: payload.laytimePOD,
            laytimeLoadCondition: payload.laytimePOL,
            laytimeDischCondition: payload.laytimePOD,
            ratePOL: loadingRate,
            ratePOD: dischargeRate,
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
    if (hasProjectCargoData && typeof window.actualizarCamposTipoCarga === 'function') {
        window.actualizarCamposTipoCarga();
    }
    setValue('vessel-dwt', requiredDwt);
    setSelectValue('metodo_carga', loadingMethod);
    setSelectValue('metodo_descarga_pod', dischargeMethod);
    applyManualOperationalRate('pol', loadingRate);
    applyManualOperationalRate('pod', dischargeRate);
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

    if (draft?.projectCargo) {
        const pc = draft.projectCargo;
        const pcWeight = Number(pc.unitWeightMT ?? pc.pesoUnitario) || 0;
        const pcLength = Number(pc.dimensions?.lengthM ?? pc.length ?? pc.largo) || 0;
        const pcWidth = Number(pc.dimensions?.widthM ?? pc.width ?? pc.ancho) || 0;
        const pcHeight = Number(pc.dimensions?.heightM ?? pc.height ?? pc.alto) || 0;
        const pcHandlingMode = String(pc.handlingMode || 'direct-lift');
        if (pcWeight > 0 || pcLength > 0 || pcWidth > 0 || pcHeight > 0) {
            setValue('project-unit-weight', pcWeight, false);
            setValue('project-length', pcLength, false);
            setValue('project-width', pcWidth, false);
            setValue('project-height', pcHeight, false);
            setSelectValue('project-handling-mode', pcHandlingMode, false);
            setValue('peso-pieza-mt', pcWeight, false);

            const currentState = window.SeaCharterStore?.getState?.() || {};
            const stateMatches = (
                Number(currentState.pesoUnitario ?? currentState.unitWeightMT) === pcWeight &&
                Number(currentState.largo ?? currentState.length) === pcLength &&
                Number(currentState.ancho ?? currentState.width) === pcWidth &&
                Number(currentState.alto ?? currentState.height) === pcHeight &&
                String(currentState.handlingMode || currentState.projectHandlingMode || 'direct-lift') === pcHandlingMode &&
                JSON.stringify(currentState.projectCargo) === JSON.stringify(pc)
            );

            if (!stateMatches) {
                window.SeaCharterStore?.set?.({
                    pesoUnitario: pcWeight,
                    unitWeightMT: pcWeight,
                    largo: pcLength,
                    length: pcLength,
                    ancho: pcWidth,
                    width: pcWidth,
                    alto: pcHeight,
                    height: pcHeight,
                    handlingMode: pcHandlingMode,
                    projectHandlingMode: pcHandlingMode,
                    projectCargo: pc,
                }, { source: 'voyage-draft-project-cargo', silent: true });
            }
            if (typeof window.actualizarCamposTipoCarga === 'function') {
                window.actualizarCamposTipoCarga();
            }
        }
    }

    if (draft?.lastSource !== 'tracking-audit') return;
    const vessel = draft.vessel || {};
    setValue('nombre-buque-calculadora', vessel.name, false);
    setValue('vessel-identity-imo', vessel.imo, false);
    setValue('vessel-dwt', vessel.dwt, false);
    setValue('vessel-identity-dwt', vessel.dwt, false);
    setValue('vessel-identity-gt', vessel.gt, false);
    setValue('vessel-identity-flag', vessel.flag, false);
    setValue('vessel-identity-year', vessel.yearBuilt, false);

    const currentVesselState = window.SeaCharterStore?.getState?.() || {};
    if (
        currentVesselState.imo !== (vessel.imo || '') ||
        Number(currentVesselState.dwt) !== Number(vessel.dwt || 0) ||
        currentVesselState.vessel !== (vessel.name || '')
    ) {
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
    }
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
window.finalizeAssistantVoyageInjection = finalizeAssistantVoyageInjection;
window.applyAssistantCompleteForm = applyAssistantCompleteForm;
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
    if (JSON.stringify(state.draft) !== JSON.stringify(previousState?.draft)) {
        hydrateCalculatorFromDraft(state.draft);
    }
    if (JSON.stringify(state.draft?.weather) !== JSON.stringify(previousState?.draft?.weather) && typeof window.runEngine === 'function') {
        window.runEngine();
    }
});
