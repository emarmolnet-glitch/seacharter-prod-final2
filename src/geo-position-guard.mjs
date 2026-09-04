/**
 * Blindaje geográfico anti-teleportación para la renderización cartográfica.
 *
 * La telemetría AIS externa devuelve con frecuencia `vessel: null`, coordenadas
 * vacías o ceros de relleno cuando el buque pierde señal en puerto o al terminar
 * operaciones. Si esos valores llegan al globo, `Number(null)` los convierte en 0
 * y el marcador salta a Null Island (0,0) o al meridiano de Greenwich sobre el
 * Canal de la Mancha / Inglaterra. Este módulo centraliza la validación y el
 * respaldo persistente para que eso nunca ocurra.
 */

const NULL_ISLAND_TOLERANCE = 0.02;
const STORAGE_KEY = 'core_pro_last_valid_positions';
const memoryPositions = new Map();

function readStorage() {
    try {
        const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeStorage(entries) {
    try {
        globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (_error) {}
}

function toFinite(...values) {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const number = Number(value);
        if (Number.isFinite(number)) return number;
    }
    return NaN;
}

/**
 * Decide si un par de coordenadas es geográficamente creíble.
 *
 * Rechaza, además de los valores no numéricos o fuera de rango:
 *  - Null Island y su entorno inmediato (0,0).
 *  - El cero exacto en cualquiera de los dos ejes: ninguna posición AIS real
 *    llega como 0.000000, así que un cero duro siempre proviene de un
 *    `Number(null)`/`Number(undefined)` y arrastraría el marcador al ecuador o
 *    al meridiano de Greenwich (Canal de la Mancha / Inglaterra).
 *  - Los centinelas "no disponible" del estándar AIS (lat 91, lon 181).
 */
export function isTrustworthyCoordinate(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat === 0 || lng === 0) return false;
    if (Math.abs(lat) < NULL_ISLAND_TOLERANCE && Math.abs(lng) < NULL_ISLAND_TOLERANCE) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (Math.abs(lat) === 91 || Math.abs(lng) === 181) return false;
    return true;
}

/**
 * Normaliza cualquier forma de posición (objeto AIS, punto de puerto, tupla)
 * y devuelve `null` en lugar de un punto envenenado cuando no es fiable.
 */
export function normalizeTrustedPosition(value) {
    if (!value) return null;
    const isTuple = Array.isArray(value);
    const lat = toFinite(
        isTuple ? value[0] : undefined,
        value.lat,
        value.latitude,
        value.Latitude,
    );
    const lng = toFinite(
        isTuple ? value[1] : undefined,
        value.lng,
        value.lon,
        value.longitude,
        value.Longitude,
    );
    if (!isTrustworthyCoordinate(lat, lng)) return null;
    return {
        ...(isTuple ? {} : value),
        lat,
        lng,
        lon: lng,
        latitude: lat,
        longitude: lng,
    };
}

/**
 * Guarda la última posición válida del buque por ámbito (`tracking`, IMO, etc.).
 * Persiste en `sessionStorage` para que sobreviva a remontajes del overlay.
 */
export function rememberTrustedPosition(scope, value, meta = {}) {
    const key = String(scope || '').trim();
    const position = normalizeTrustedPosition(value);
    if (!key || !position) return null;
    const entry = {
        lat: position.lat,
        lng: position.lng,
        lon: position.lng,
        latitude: position.lat,
        longitude: position.lng,
        source: meta.source || position.positionSource || 'ais_telemetry',
        vesselName: meta.vesselName || position.vesselName || position.name || '',
        imo: String(meta.imo || position.imo || '').replace(/\D/g, ''),
        rememberedAt: new Date().toISOString(),
    };
    memoryPositions.set(key, entry);
    const entries = readStorage();
    entries[key] = entry;
    writeStorage(entries);
    return entry;
}

/** Recupera la última posición válida conocida para un ámbito. */
export function getLastTrustedPosition(scope) {
    const key = String(scope || '').trim();
    if (!key) return null;
    const cached = memoryPositions.get(key);
    if (cached) return { ...cached };
    const stored = normalizeTrustedPosition(readStorage()[key]);
    if (!stored) return null;
    memoryPositions.set(key, stored);
    return { ...stored };
}

/** Olvida el respaldo de un ámbito (cambio de expediente o cierre de sesión). */
export function forgetTrustedPosition(scope) {
    const key = String(scope || '').trim();
    if (!key) return false;
    memoryPositions.delete(key);
    const entries = readStorage();
    if (!(key in entries)) return false;
    delete entries[key];
    writeStorage(entries);
    return true;
}

/**
 * Coordenadas del puerto de operaciones activo según la fase del expediente.
 * A partir de la fase 5 (llegada a POD) manda el puerto de descarga; antes,
 * el de carga; y como último recurso el puerto de lastre/anterior.
 */
export function resolveOperationsPortPosition(dossier = {}) {
    const ports = dossier.ports && typeof dossier.ports === 'object' ? dossier.ports : dossier;
    const phase = Number(dossier.phase);
    const pol = ports.pol || ports.POL || null;
    const pod = ports.pod || ports.POD || null;
    const ballast = ports.ballast || ports.previousPort || ports.BALLAST || null;
    const ordered = Number.isFinite(phase) && phase >= 5
        ? [pod, pol, ballast]
        : [pol, pod, ballast];
    const roles = Number.isFinite(phase) && phase >= 5
        ? ['pod', 'pol', 'ballast']
        : ['pol', 'pod', 'ballast'];
    for (let index = 0; index < ordered.length; index += 1) {
        const position = normalizeTrustedPosition(ordered[index]);
        if (position) {
            return {
                ...position,
                positionSource: `operations_port:${roles[index]}`,
                portName: ordered[index]?.name || ordered[index]?.id || '',
            };
        }
    }
    return null;
}

/**
 * Punto único de decisión del mapa: devuelve la posición que debe pintarse.
 *
 * Prioriza la telemetría cuando es creíble; si falla, retiene la última posición
 * válida y, en su defecto, fija el puerto de operaciones del dossier. Nunca
 * devuelve (0,0) ni un punto derivado de coordenadas vacías.
 */
export function resolveSafeMapPosition({ scope = 'tracking', candidate = null, dossier = null, remember = true } = {}) {
    const trusted = normalizeTrustedPosition(candidate);
    if (trusted) {
        if (remember) rememberTrustedPosition(scope, trusted);
        return { ...trusted, positionSource: trusted.positionSource || 'ais_telemetry', positionTrust: 'live' };
    }

    const lastKnown = getLastTrustedPosition(scope);
    if (lastKnown) {
        return { ...lastKnown, positionSource: 'last_known_valid', positionTrust: 'retained' };
    }

    const port = dossier ? resolveOperationsPortPosition(dossier) : null;
    if (port) return { ...port, positionTrust: 'port_fallback' };

    return null;
}

export const GeoPositionGuard = Object.freeze({
    NULL_ISLAND_TOLERANCE,
    forgetTrustedPosition,
    getLastTrustedPosition,
    isTrustworthyCoordinate,
    normalizeTrustedPosition,
    rememberTrustedPosition,
    resolveOperationsPortPosition,
    resolveSafeMapPosition,
});

if (typeof window !== 'undefined') window.GeoPositionGuard = GeoPositionGuard;

export default GeoPositionGuard;
