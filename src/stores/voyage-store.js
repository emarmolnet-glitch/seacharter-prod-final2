import { createStore } from 'zustand/vanilla';

const EMPTY_DRAFT = Object.freeze({
    pol: null,
    pod: null,
    laycan: { laydays: '', cancelling: '' },
    cargo: { description: '', quantityMt: 0 },
    ballastDistanceNm: null,
    lastreCoordinates: [],
    distanceNm: null,
    routeGeometry: null,
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

function normalizePort(port, fallbackName = '') {
    const source = port && typeof port === 'object' ? port : {};
    const name = cleanText(source.name || source.id || fallbackName);
    if (!name) return null;
    const lat = Number(source.lat ?? source.latitude);
    const lng = Number(source.lng ?? source.lon ?? source.longitude);
    return {
        name,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
    };
}

function normalizeVessel(vessel) {
    if (!vessel || typeof vessel !== 'object') return null;
    const imo = cleanText(vessel.imo || vessel.imoNumber || vessel.imo_number).replace(/\D/g, '');
    const name = cleanText(vessel.name || vessel.vesselName || vessel.vessel_name);
    if (!imo && !name) return null;
    return {
        name,
        imo,
        mmsi: cleanText(vessel.mmsi).replace(/\D/g, ''),
        dwt: cleanNumber(vessel.dwt),
        gt: cleanNumber(vessel.gt ?? vessel.grossTonnage ?? vessel.gross_tonnage),
        flag: cleanText(vessel.flag),
        yearBuilt: cleanNumber(vessel.yearBuilt ?? vessel.year_built ?? vessel.builtYear ?? vessel.built_year),
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

export const voyageStore = createStore((set, get) => ({
    draft: { ...EMPTY_DRAFT, laycan: { ...EMPTY_DRAFT.laycan }, cargo: { ...EMPTY_DRAFT.cargo } },
    updateFromCalculator: (state = {}) => set((current) => ({
        draft: {
            ...current.draft,
            pol: normalizePort(state.polCoordinates, state.pol) || current.draft.pol,
            pod: normalizePort(state.podCoordinates, state.pod) || current.draft.pod,
            laycan: {
                laydays: cleanText(state.laydays || state.laycan?.laydays || state.laycanDate),
                cancelling: cleanText(state.cancelling || state.laycan?.cancelling || state.cancellingDate),
            },
            cargo: {
                description: cleanText(state.cargoProduct || state.cargoType || current.draft.cargo.description),
                quantityMt: cleanNumber(state.cargoQuantity || state.cargo),
            },
            ballastDistanceNm: cleanNumber(state.distBallast) || current.draft.ballastDistanceNm,
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
    })),
    applyTrackingAudit: ({ ballastDistanceNm, lastreCoordinates, vessel } = {}) => set((current) => {
        const normalizedCoordinates = normalizeRouteCoordinates(lastreCoordinates);
        return {
            draft: {
                ...current.draft,
                ballastDistanceNm: cleanNumber(ballastDistanceNm) || current.draft.ballastDistanceNm,
                lastreCoordinates: normalizedCoordinates.length > 2 ? normalizedCoordinates : current.draft.lastreCoordinates,
                vessel: normalizeVessel(vessel) || current.draft.vessel,
                updatedAt: new Date().toISOString(),
                lastSource: 'tracking-audit',
            },
        };
    }),
    applyTrackingRoute: ({ distanceNm, routeGeometry, ballastDistanceNm, lastreCoordinates } = {}) => set((current) => {
        const normalizedCoordinates = normalizeRouteCoordinates(lastreCoordinates);
        return {
            draft: {
                ...current.draft,
                ballastDistanceNm: cleanNumber(ballastDistanceNm) || current.draft.ballastDistanceNm,
                lastreCoordinates: normalizedCoordinates.length > 2 ? normalizedCoordinates : current.draft.lastreCoordinates,
                distanceNm: cleanNumber(distanceNm) || current.draft.distanceNm,
                routeGeometry: routeGeometry && typeof routeGeometry === 'object' ? routeGeometry : current.draft.routeGeometry,
                updatedAt: new Date().toISOString(),
                lastSource: 'tracking-route',
            },
        };
    }),
    clearDraft: () => set({
        draft: { ...EMPTY_DRAFT, laycan: { ...EMPTY_DRAFT.laycan }, cargo: { ...EMPTY_DRAFT.cargo } },
    }),
    hasOperationalDraft: () => hasOperationalDraft(get().draft),
}));

export const useVoyageStore = voyageStore;
