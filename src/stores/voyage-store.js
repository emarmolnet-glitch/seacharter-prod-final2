import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

const EMPTY_DRAFT = Object.freeze({
    pol: null,
    pod: null,
    laycan: { laydays: '', cancelling: '' },
    cargo: { description: '', quantityMt: 0 },
    loadingRate: 0,
    dischargeRate: 0,
    dwt: 0,
    methodPOL: '',
    methodPOD: '',
    ratePOL: 0,
    ratePOD: 0,
    ballastDistanceNm: null,
    ballastDistanceSource: '',
    lastreCoordinates: [],
    distanceNm: null,
    routeGeometry: null,
    weather: null,
    vessel: null,
    updatedAt: null,
    lastSource: '',
});

function cleanText(value) {
    return String(value ?? '').trim();
}

function cleanNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function cleanNonNegativeNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

function cleanMethod(value) {
    if (value && typeof value === 'object') return cleanText(value.value || value.label);
    return cleanText(value);
}

function resolveCalculatorBallastDistance(state, draft) {
    const incomingDistance = cleanNonNegativeNumber(state?.distBallast);
    const retainedDistance = cleanNonNegativeNumber(draft?.ballastDistanceNm);
    if (incomingDistance === null) return retainedDistance;
    if (incomingDistance === 0 && retainedDistance > 0) return retainedDistance;
    return incomingDistance;
}

function normalizePort(port, fallbackName = '') {
    const source = port && typeof port === 'object' ? port : {};
    const name = cleanText(source.name || source.id || fallbackName);
    if (!name) return null;
    const lat = Number(source.lat ?? source.latitude);
    const lng = Number(source.lng ?? source.lon ?? source.longitude);
    return {
        ...source,
        name,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        ...(source.source === 'WPI' ? {
            indexNo: Number(source.indexNo) || null,
            regionNo: Number(source.regionNo) || null,
            officialLabel: cleanText(source.officialLabel),
            countryCode: cleanText(source.countryCode).toUpperCase(),
            latitude: Number.isFinite(lat) ? lat : null,
            longitude: Number.isFinite(lng) ? lng : null,
            source: 'WPI',
        } : {}),
    };
}

function normalizeNlpPort(port, fallbackName = '') {
    const normalizedName = cleanText(port?.name || port?.id || fallbackName);
    if (/^(?:POL|POD)$/i.test(normalizedName)) return null;
    return normalizePort(port, fallbackName);
}

function normalizeVessel(vessel) {
    if (!vessel || typeof vessel !== 'object') return null;
    const imo = cleanText(vessel.imo || vessel.imoNumber || vessel.imo_number).replace(/\D/g, '');
    const name = cleanText(vessel.name || vessel.vesselName || vessel.vessel_name);
    if (!imo && !name) return null;
    const latitude = Number(vessel.latitude ?? vessel.lat ?? vessel.position?.latitude ?? vessel.position?.lat);
    const longitude = Number(vessel.longitude ?? vessel.lon ?? vessel.lng ?? vessel.position?.longitude ?? vessel.position?.lon ?? vessel.position?.lng);
    const speedKnots = Number(vessel.speedKnots ?? vessel.speed_over_ground ?? vessel.speedOverGround ?? vessel.speed ?? vessel.sog);
    return {
        name,
        imo,
        mmsi: cleanText(vessel.mmsi).replace(/\D/g, ''),
        dwt: cleanNumber(vessel.dwt),
        gt: cleanNumber(vessel.gt ?? vessel.grossTonnage ?? vessel.gross_tonnage),
        flag: cleanText(vessel.flag),
        yearBuilt: cleanNumber(vessel.yearBuilt ?? vessel.year_built ?? vessel.builtYear ?? vessel.built_year),
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        speedKnots: Number.isFinite(speedKnots) && speedKnots >= 0 ? speedKnots : null,
        positionUpdatedAt: cleanText(vessel.positionUpdatedAt || vessel.position_updated_at || vessel.timestamp || vessel.updatedAt) || null,
    };
}

function normalizeRouteCoordinates(coordinates) {
    return (Array.isArray(coordinates) ? coordinates : [])
        .map((point) => {
            const lat = Number(Array.isArray(point) ? point[0] : point?.lat ?? point?.latitude);
            const lng = Number(Array.isArray(point) ? point[1] : point?.lng ?? point?.lon ?? point?.longitude);
            return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
        })
        .filter(Boolean);
}

export function hasOperationalDraft(draft) {
    return Boolean(
        draft?.pol?.name
        && draft?.pod?.name
        && draft?.laycan?.laydays
        && draft?.laycan?.cancelling
        && cleanNumber(draft?.cargo?.quantityMt) > 0
    );
}

export const voyageStore = createStore(subscribeWithSelector((set, get) => ({
    draft: { ...EMPTY_DRAFT, laycan: { ...EMPTY_DRAFT.laycan }, cargo: { ...EMPTY_DRAFT.cargo } },
    applyNlpScenario: (scenario = {}) => set((current) => ({
        draft: {
            ...current.draft,
            pol: normalizeNlpPort(scenario.pol_port || scenario.pol, cleanText(scenario.pol)) || current.draft.pol,
            pod: normalizeNlpPort(scenario.pod_port || scenario.pod, cleanText(scenario.pod)) || current.draft.pod,
            laycan: {
                laydays: cleanText(scenario.laydays) || current.draft.laycan.laydays,
                cancelling: cleanText(scenario.cancelling) || current.draft.laycan.cancelling,
            },
            cargo: {
                description: cleanText(scenario.cargo_type || scenario.cargoType) || current.draft.cargo.description,
                quantityMt: scenario.cargo_qty !== undefined || scenario.cargoQty !== undefined
                    ? cleanNumber(scenario.cargo_qty ?? scenario.cargoQty) || current.draft.cargo.quantityMt
                    : current.draft.cargo.quantityMt,
            },
            loadingRate: scenario.ratePOL !== undefined || scenario.loading_rate !== undefined || scenario.loadingRate !== undefined
                ? cleanNumber(scenario.ratePOL ?? scenario.loading_rate ?? scenario.loadingRate) || current.draft.loadingRate
                : current.draft.loadingRate,
            dischargeRate: scenario.ratePOD !== undefined || scenario.discharge_rate !== undefined || scenario.dischargeRate !== undefined
                ? cleanNumber(scenario.ratePOD ?? scenario.discharge_rate ?? scenario.dischargeRate) || current.draft.dischargeRate
                : current.draft.dischargeRate,
            dwt: cleanNumber(scenario.dwt ?? scenario.required_dwt ?? scenario.requiredDwt) || current.draft.dwt,
            methodPOL: cleanMethod(scenario.methodPOL ?? scenario.loading_method ?? scenario.loadingMethod ?? scenario.loadMethod) || current.draft.methodPOL,
            methodPOD: cleanMethod(scenario.methodPOD ?? scenario.discharge_method ?? scenario.dischargeMethod) || current.draft.methodPOD,
            ratePOL: cleanNumber(scenario.ratePOL ?? scenario.loading_rate ?? scenario.loadingRate) || current.draft.ratePOL,
            ratePOD: cleanNumber(scenario.ratePOD ?? scenario.discharge_rate ?? scenario.dischargeRate) || current.draft.ratePOD,
            updatedAt: new Date().toISOString(),
            lastSource: 'assistant-nlp',
        },
    })),
    updateFromCalculator: (state = {}) => set((current) => {
        const ballastDistanceNm = resolveCalculatorBallastDistance(state, current.draft);
        const ballastDistanceChanged = ballastDistanceNm !== current.draft.ballastDistanceNm;
        const laydays = cleanText(
            state.laydays
            || state.laycan?.laydays
            || state.laycan?.start
            || state.laycanDate
            || state.laycan_start
        ) || current.draft.laycan.laydays;
        const cancelling = cleanText(
            state.cancelling
            || state.laycan?.cancelling
            || state.laycan?.end
            || state.cancellingDate
            || state.laycan_end
        ) || current.draft.laycan.cancelling;
        return {
            draft: {
                ...current.draft,
                pol: normalizePort(state.polCoordinates, state.pol) || current.draft.pol,
                pod: normalizePort(state.podCoordinates, state.pod) || current.draft.pod,
                laycan: {
                    laydays,
                    cancelling,
                },
                cargo: {
                    description: cleanText(state.cargoProduct || state.cargoType || current.draft.cargo.description),
                    quantityMt: cleanNumber(state.cargoQuantity || state.cargo),
                },
                loadingRate: cleanNumber(state.ratePOL ?? state.ritmoRealPol ?? state.loadRate) || current.draft.loadingRate,
                dischargeRate: cleanNumber(state.ratePOD ?? state.ritmoRealPod ?? state.dischargeRate ?? state.dischRate) || current.draft.dischargeRate,
                dwt: cleanNumber(state.dwt ?? state.vesselDwt) || current.draft.dwt,
                methodPOL: cleanMethod(state.methodPOL ?? state.loadMethod) || current.draft.methodPOL,
                methodPOD: cleanMethod(state.methodPOD ?? state.dischargeMethod) || current.draft.methodPOD,
                ratePOL: cleanNumber(state.ratePOL ?? state.ritmoRealPol ?? state.loadRate) || current.draft.ratePOL,
                ratePOD: cleanNumber(state.ratePOD ?? state.ritmoRealPod ?? state.dischargeRate ?? state.dischRate) || current.draft.ratePOD,
                ballastDistanceNm,
                ballastDistanceSource: ballastDistanceChanged
                    ? 'calculator'
                    : current.draft.ballastDistanceSource,
                distanceNm: cleanNumber(state.totalMiles ?? state.distanceNm) || current.draft.distanceNm,
                routeGeometry: state.routeGeometry || current.draft.routeGeometry,
                vessel: normalizeVessel({
                    name: state.vesselName || state.vessel,
                    imo: state.imo,
                    dwt: state.dwt,
                    gt: state.gt,
                    flag: state.flag,
                    yearBuilt: state.yearBuilt,
                }) || current.draft.vessel,
                updatedAt: new Date().toISOString(),
                lastSource: 'calculator',
            },
        };
    }),
    setBallastDistance: ({ ballastDistanceNm, source = 'calculator-manual' } = {}) => set((current) => {
        const normalizedDistance = cleanNonNegativeNumber(ballastDistanceNm);
        if (normalizedDistance === null) return current;
        return {
            draft: {
                ...current.draft,
                ballastDistanceNm: normalizedDistance,
                ballastDistanceSource: cleanText(source) || 'calculator-manual',
                updatedAt: new Date().toISOString(),
                lastSource: cleanText(source) || 'calculator-manual',
            },
        };
    }),
    applyTrackingAudit: ({ ballastDistanceNm, lastreCoordinates, vessel } = {}) => set((current) => {
        const normalizedDistance = cleanNonNegativeNumber(ballastDistanceNm);
        const normalizedCoordinates = normalizeRouteCoordinates(lastreCoordinates);
        return {
            draft: {
                ...current.draft,
                ballastDistanceNm: normalizedDistance ?? current.draft.ballastDistanceNm,
                ballastDistanceSource: normalizedDistance !== null
                    ? 'tracking-audit'
                    : current.draft.ballastDistanceSource,
                lastreCoordinates: normalizedCoordinates.length >= 2 ? normalizedCoordinates : current.draft.lastreCoordinates,
                vessel: normalizeVessel(vessel) || current.draft.vessel,
                updatedAt: new Date().toISOString(),
                lastSource: 'tracking-audit',
            },
        };
    }),
    applyMatchingCandidate: ({ ballastDistanceNm, lastreCoordinates, vessel } = {}) => set((current) => {
        const normalizedDistance = cleanNonNegativeNumber(ballastDistanceNm);
        const normalizedCoordinates = normalizeRouteCoordinates(lastreCoordinates);
        return {
            draft: {
                ...current.draft,
                ballastDistanceNm: normalizedDistance ?? current.draft.ballastDistanceNm,
                ballastDistanceSource: normalizedDistance !== null
                    ? 'matching-neon-maritime'
                    : current.draft.ballastDistanceSource,
                lastreCoordinates: normalizedCoordinates.length >= 2 ? normalizedCoordinates : current.draft.lastreCoordinates,
                vessel: normalizeVessel(vessel) || current.draft.vessel,
                updatedAt: new Date().toISOString(),
                lastSource: 'matching-neon-maritime',
            },
        };
    }),
    applyTrackingRoute: ({ distanceNm, routeGeometry, ballastDistanceNm, lastreCoordinates } = {}) => set((current) => {
        const normalizedBallastDistance = cleanNonNegativeNumber(ballastDistanceNm);
        const normalizedCoordinates = normalizeRouteCoordinates(lastreCoordinates);
        return {
            draft: {
                ...current.draft,
                ballastDistanceNm: normalizedBallastDistance ?? current.draft.ballastDistanceNm,
                ballastDistanceSource: normalizedBallastDistance !== null
                    ? 'tracking-route'
                    : current.draft.ballastDistanceSource,
                lastreCoordinates: normalizedCoordinates.length >= 2 ? normalizedCoordinates : current.draft.lastreCoordinates,
                distanceNm: cleanNumber(distanceNm) || current.draft.distanceNm,
                routeGeometry: routeGeometry && typeof routeGeometry === 'object' ? routeGeometry : current.draft.routeGeometry,
                updatedAt: new Date().toISOString(),
                lastSource: 'tracking-route',
            },
        };
    }),
    setWeatherSnapshot: (weather = null) => set((current) => {
        const normalizedWeather = weather && typeof weather === 'object' ? weather : null;
        if (JSON.stringify(current.draft.weather) === JSON.stringify(normalizedWeather)) return current;
        return {
            draft: {
                ...current.draft,
                weather: normalizedWeather,
                updatedAt: new Date().toISOString(),
            },
        };
    }),
    clearDraft: () => set({
        draft: { ...EMPTY_DRAFT, laycan: { ...EMPTY_DRAFT.laycan }, cargo: { ...EMPTY_DRAFT.cargo } },
    }),
    hasOperationalDraft: () => hasOperationalDraft(get().draft),
})));

export const useVoyageStore = voyageStore;
