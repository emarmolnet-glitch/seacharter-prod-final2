/**
 * map_loader.js - Core module for ship coordinate normalization, position filtering, 
 * viewport-based search queries, and matching engine synchronization.
 */

(function () {
    const MAP_STYLE_CONFIG = Object.freeze({
        engine: 'mapbox-gl-js',
        styleName: 'SeaCharter Bathymetric Light',
        colors: {
            deepWater: '#004e64',
            shelfWater: '#25a18e',
            routeLine: '#2a7b9b',
            land: '#e0e8f0',
            surface: '#ffffff',
            text: '#12313f'
        },
        mapbox: {
            tokenGlobal: 'MAPBOX_ACCESS_TOKEN',
            tokenStorageKey: 'mapbox_access_token',
            styleUrlGlobal: 'MAPBOX_BATHYMETRIC_STYLE_URL',
            styleUrlStorageKey: 'mapbox_bathymetric_style_url',
            studioStyleUrl: 'mapbox://styles/seachartercorepro/sea-bathymetric-core',
            style: {
                version: 8,
                sources: {
                    composite: {
                        type: 'vector',
                        url: 'mapbox://mapbox.mapbox-streets-v8'
                    },
                    bathymetryDem: {
                        type: 'raster-dem',
                        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                        tileSize: 512,
                        maxzoom: 14
                    }
                },
                glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
                sprite: 'mapbox://sprites/mapbox/light-v11',
                layers: [
                    { id: 'background', type: 'background', paint: { 'background-color': '#d8f2f4' } },
                    { id: 'water', type: 'fill', source: 'composite', 'source-layer': 'water', paint: { 'fill-color': '#9fd8df' } },
                    { id: 'bathymetry-depth', type: 'fill', source: 'composite', 'source-layer': 'water', paint: { 'fill-color': ['interpolate', ['linear'], ['zoom'], 1, '#004e64', 5, '#1c7c8d', 9, '#25a18e'], 'fill-opacity': 0.78 } },
                    { id: 'bathymetry-hillshade', type: 'hillshade', source: 'bathymetryDem', paint: { 'hillshade-shadow-color': '#004e64', 'hillshade-highlight-color': '#e7f8f6', 'hillshade-accent-color': '#25a18e', 'hillshade-exaggeration': 0.42 } },
                    { id: 'land', type: 'fill', source: 'composite', 'source-layer': 'landuse', paint: { 'fill-color': '#e0e8f0' } },
                    { id: 'admin-boundaries', type: 'line', source: 'composite', 'source-layer': 'admin', paint: { 'line-color': '#b7c6d3', 'line-width': 0.7, 'line-opacity': 0.45 } },
                    { id: 'place-labels', type: 'symbol', source: 'composite', 'source-layer': 'place_label', layout: { 'text-field': ['get', 'name'], 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'], 'text-size': 11 }, paint: { 'text-color': '#12313f', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 } }
                ]
            }
        },
        fallback: {
            tileUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            tileOptions: {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20,
                zIndex: 1
            }
        },
        icons: {
            load: '/Ancla Load.svg',
            discharge: '/Ancla Discharge.svg'
        }
    });

    function getMapStyleConfig() {
        return MAP_STYLE_CONFIG;
    }

    function getMapboxToken() {
        if (typeof window === 'undefined') return '';
        const explicit = window[MAP_STYLE_CONFIG.mapbox.tokenGlobal] || window.mapboxAccessToken || '';
        if (explicit) return String(explicit).trim();
        try {
            return String(localStorage.getItem(MAP_STYLE_CONFIG.mapbox.tokenStorageKey) || '').trim();
        } catch (_) {
            return '';
        }
    }

    function getMapboxStyle() {
        if (typeof window !== 'undefined') {
            const explicit = window[MAP_STYLE_CONFIG.mapbox.styleUrlGlobal] || window.mapboxBathymetricStyleUrl || '';
            if (explicit) return String(explicit).trim();
            try {
                const stored = String(localStorage.getItem(MAP_STYLE_CONFIG.mapbox.styleUrlStorageKey) || '').trim();
                if (stored) return stored;
            } catch (_) {}
        }
        return MAP_STYLE_CONFIG.mapbox.studioStyleUrl || MAP_STYLE_CONFIG.mapbox.style;
    }

    function createFallbackLeafletMap(containerId, options) {
        if (typeof L === 'undefined' || !L || typeof L.map !== 'function') {
            return null;
        }
        const config = Object.assign({ center: [20.0, 0.0], zoom: 2, attributionControl: false, preferCanvas: true }, options || {});
        const map = L.map(containerId, config).setView(config.center, config.zoom);
        L.tileLayer(MAP_STYLE_CONFIG.fallback.tileUrl, Object.assign({}, MAP_STYLE_CONFIG.fallback.tileOptions, {
            className: 'nautical-map-base'
        })).addTo(map);
        map.seaCharterEngine = 'leaflet-fallback';
        return map;
    }

    function createUnifiedMap(containerId, options) {
        const config = Object.assign({ center: [20.0, 0.0], zoom: 2 }, options || {});
        const token = getMapboxToken();
        const canUseMapbox = typeof mapboxgl !== 'undefined' && mapboxgl && token;
        if (!canUseMapbox) {
            return createFallbackLeafletMap(containerId, config);
        }

        try {
            mapboxgl.accessToken = token;
            const map = new mapboxgl.Map({
                container: containerId,
                style: getMapboxStyle(),
                center: [config.center[1], config.center[0]],
                zoom: config.zoom,
                attributionControl: false,
                failIfMajorPerformanceCaveat: false
            });
            map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
            map.once('error', function () {
                const container = document.getElementById(containerId);
                try { map.remove(); } catch (_) {}
                if (container) container.innerHTML = '';
                createFallbackLeafletMap(containerId, config);
            });
            map.seaCharterEngine = 'mapbox-gl-js';
            return map;
        } catch (err) {
            console.warn('[SeaCharter Maps] Mapbox GL style failed; using fallback base map.', err);
            return createFallbackLeafletMap(containerId, config);
        }
    }

    const hydrationInFlight = new Set();
    const hydrationCache = new Set();
    let isEmittingHydrationUpdate = false;
    const aisStreamState = {
        ws: null,
        reconnectTimer: null,
        mapMoveTimer: null,
        boundMap: null,
        reconnectDelayMs: 4000,
        endpoint: '',
        apiKey: '',
        currentBounds: null,
        boundsKey: '',
        shouldReconnect: false,
        options: {}
    };
    const aisProxyPollingState = {
        timer: null,
        inFlight: false,
        intervalMs: 300000,
        retryIndex: 0,
        retryDelaysMs: [5000, 10000, 30000],
        userActivated: false,
        endpoint: '/api/audit-vessels',
        map: null,
        waitingForMapIdle: false
    };
    const searchNodes = Object.freeze({
        mediterranean: [
            { name: 'Barcelona', lat: 41.35, lon: 2.17, region: 'Mediterráneo' },
            { name: 'Fos-sur-Mer', lat: 43.43, lon: 4.91, region: 'Mediterráneo' },
            { name: 'Génova', lat: 44.40, lon: 8.93, region: 'Mediterráneo' },
            { name: 'Marsella', lat: 43.30, lon: 5.37, region: 'Mediterráneo' },
            { name: 'Savona', lat: 44.31, lon: 8.48, region: 'Mediterráneo' },
            { name: 'Valencia', lat: 39.45, lon: -0.32, region: 'Mediterráneo' },
            { name: 'Tarragona', lat: 41.10, lon: 1.24, region: 'Mediterráneo' }
        ],
        northAfricaMediterranean: [
            { name: 'Orán', lat: 35.708, lon: -0.633, region: 'Mediterráneo norteafricano' },
            { name: 'Béjaïa', lat: 36.751, lon: 5.084, region: 'Mediterráneo norteafricano' },
            { name: 'Argel', lat: 36.772, lon: 3.060, region: 'Mediterráneo norteafricano' },
            { name: 'Skikda', lat: 36.887, lon: 6.905, region: 'Mediterráneo norteafricano' },
            { name: 'Rades', lat: 36.800, lon: 10.283, region: 'Mediterráneo norteafricano' },
            { name: 'Sfax', lat: 34.739, lon: 10.760, region: 'Mediterráneo norteafricano' },
            { name: 'Gabes', lat: 33.883, lon: 10.100, region: 'Mediterráneo norteafricano' },
            { name: 'Tripoli', lat: 32.900, lon: 13.183, region: 'Mediterráneo norteafricano' },
            { name: 'Misrata', lat: 32.375, lon: 15.092, region: 'Mediterráneo norteafricano' },
            { name: 'Benghazi', lat: 32.117, lon: 20.067, region: 'Mediterráneo norteafricano' },
            { name: 'Alexandria', lat: 31.200, lon: 29.883, region: 'Mediterráneo norteafricano' },
            { name: 'Port Said', lat: 31.267, lon: 32.300, region: 'Mediterráneo norteafricano' }
        ],
        atlanticIberia: [
            { name: 'Huelva', lat: 37.25, lon: -6.95, region: 'Atlántico Ibérico' },
            { name: 'Cádiz', lat: 36.53, lon: -6.29, region: 'Atlántico Ibérico' },
            { name: 'Algeciras', lat: 36.14, lon: -5.44, region: 'Atlántico Ibérico' },
            { name: 'Lisboa', lat: 38.70, lon: -9.15, region: 'Atlántico Ibérico' },
            { name: 'Sines', lat: 37.95, lon: -8.87, region: 'Atlántico Ibérico' }
        ],
        northEurope: [
            { name: 'Rotterdam', lat: 51.95, lon: 4.14, region: 'Norte de Europa' },
            { name: 'Antwerp', lat: 51.26, lon: 4.40, region: 'Norte de Europa' },
            { name: 'Hamburg', lat: 53.54, lon: 9.99, region: 'Norte de Europa' },
            { name: 'Amsterdam', lat: 52.38, lon: 4.90, region: 'Norte de Europa' }
        ]
    });

    function firstDefined() {
        for (let i = 0; i < arguments.length; i++) {
            if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== "") {
                return arguments[i];
            }
        }
        return null;
    }

    function normalizePortSearchName(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function getSearchNodesForPort(portName) {
        const normalizedPort = normalizePortSearchName(portName);
        if (!normalizedPort) return [];
        const allNodes = Object.values(searchNodes).flat();
        const directNode = allNodes.find((node) => normalizePortSearchName(node.name) === normalizedPort);
        if (!directNode) return [];
        return allNodes
            .filter((node) => node.region === directNode.region && normalizePortSearchName(node.name) !== normalizedPort)
            .map((node) => Object.assign({ source: 'NODE' }, node));
    }

    function vesselKey(ship) {
        if (!ship) return null;
        const meta = ship.MetaData || {};
        return firstDefined(ship.mmsi, ship.MMSI, meta.mmsi, meta.MMSI, ship.imo, ship.IMO, meta.imo, meta.IMO, ship.name, ship.ShipName, meta.ShipName);
    }

    function normalizeNumeric(value) {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function findValidAisDirection(scopes, keys, unavailableValue) {
        for (const scope of scopes) {
            if (!scope || typeof scope !== 'object') continue;
            for (const key of keys) {
                const direction = normalizeNumeric(scope[key]);
                if (direction === null || direction === unavailableValue) continue;
                if (direction >= 0 && direction < 360) return direction;
            }
        }
        return null;
    }

    function resolveAisNavigationCourse(scopesInput) {
        const scopes = Array.isArray(scopesInput) ? scopesInput : [scopesInput];
        const cog = findValidAisDirection(scopes, ['courseOverGround', 'CourseOverGround', 'cogDegrees', 'Cog', 'COG', 'cog', 'course', 'Course'], 360);
        const hdg = findValidAisDirection(scopes, ['trueHeading', 'TrueHeading', 'HDG', 'hdg', 'heading', 'Heading'], 511);
        if (cog !== null) return { value: cog, source: 'COG', cog, hdg };
        if (hdg !== null) return { value: hdg, source: 'HDG', cog, hdg };
        return { value: null, source: null, cog, hdg };
    }

    function getVesselDisplayName(ship) {
        const meta = ship && ship.MetaData ? ship.MetaData : {};
        return firstDefined(ship && ship.name, ship && ship.ShipName, ship && ship.vessel_name, meta.ShipName, meta.shipName, meta.name) || "Sin nombre";
    }

    function isCommercialVessel(ship) {
        return Boolean(ship);
    }

    function filterCommercialVessels(vessels) {
        return (Array.isArray(vessels) ? vessels : []).filter(Boolean);
    }

    function parseAisSourcePayload(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        if (typeof value !== 'string' || !value.trim()) return {};
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    /**
     * Módulo de Geofencing (Haversine)
     * Calcula la distancia en millas náuticas (NM) entre la posición actual del buque y el POL.
     */
    function calculateDistanceToPort(vesselLat, vesselLon, portLat, portLon) {
        if (vesselLat === null || vesselLat === undefined || vesselLon === null || vesselLon === undefined ||
            portLat === null || portLat === undefined || portLon === null || portLon === undefined) {
            return null;
        }
        const vLat = Number(vesselLat);
        const vLon = Number(vesselLon);
        const pLat = Number(portLat);
        const pLon = Number(portLon);
        if (!Number.isFinite(vLat) || !Number.isFinite(vLon) || !Number.isFinite(pLat) || !Number.isFinite(pLon)) {
            return null;
        }
        const R = 3440.065; // Radio de la Tierra en millas náuticas (NM)
        const dLat = (pLat - vLat) * Math.PI / 180;
        const dLon = (pLon - vLon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(vLat * Math.PI / 180) * Math.cos(pLat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Number((R * c).toFixed(3));
    }

    function getVesselDataScopes(vessel) {
        if (!vessel || typeof vessel !== 'object') return [];
        const sourcePayload = parseAisSourcePayload(vessel.source_payload || vessel.sourcePayload);
        const message = vessel.Message || vessel.message || sourcePayload.Message || sourcePayload.message || {};
        const metadata = vessel.MetaData || vessel.metadata || message.MetaData || message.metadata || sourcePayload.MetaData || sourcePayload.metadata || {};
        const position = vessel.PositionReport
            || vessel.StandardClassBPositionReport
            || vessel.ExtendedClassBPositionReport
            || vessel.position
            || message.PositionReport
            || message.StandardClassBPositionReport
            || message.ExtendedClassBPositionReport
            || message.position
            || sourcePayload.PositionReport
            || sourcePayload.StandardClassBPositionReport
            || sourcePayload.ExtendedClassBPositionReport
            || sourcePayload.position
            || {};
        return [vessel, sourcePayload, message, metadata, position];
    }

    function readVesselField(vessel, aliases) {
        for (const scope of getVesselDataScopes(vessel)) {
            for (const alias of aliases) {
                const value = scope?.[alias];
                if (value !== undefined && value !== null && String(value).trim() !== '') return value;
            }
        }
        return null;
    }

    function readRealVesselSpeed(vessel) {
        const rawSpeed = readVesselField(vessel, ['speed_over_ground', 'speedOverGround', 'speed', 'Speed', 'sog', 'Sog', 'SOG']);
        if (rawSpeed === null) return null;
        const speed = Number(String(rawSpeed).replace(',', '.'));
        return Number.isFinite(speed) && speed >= 0 ? speed : null;
    }

    function inferSpatialVesselStatus(vessel, referencePorts = [], options = {}) {
        const destinationDisplay = readVesselField(vessel, ['destinationDisplay', 'destination_display']);
        if (destinationDisplay && /\ben\s+ruta\b/i.test(String(destinationDisplay))) return 'Navegando';

        const directStatus = readVesselField(vessel, [
            'navigation_status', 'navigationStatus', 'navigational_status',
            'navigationalStatus', 'NavigationalStatus', 'status_navigation', 'statusNavigation', 'statusLabel'
        ]);
        const normalizedDirectStatus = String(directStatus ?? '').trim();
        if (normalizedDirectStatus && !['-', 'N/D', 'ESTADO N/D'].includes(normalizedDirectStatus.toUpperCase())) {
            return normalizedDirectStatus;
        }

        const latitude = Number(readVesselField(vessel, ['latitude', 'lat', 'Latitude', 'AIS_Live_Lat', 'LAT']));
        const longitude = Number(readVesselField(vessel, ['longitude', 'lon', 'lng', 'Longitude', 'AIS_Live_Lon', 'LON', 'LONG']));
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'Estado N/D';

        const ports = (Array.isArray(referencePorts) ? referencePorts : [referencePorts])
            .map(port => ({
                lat: Number(port?.lat ?? port?.latitude ?? port?.Latitude),
                lon: Number(port?.lon ?? port?.lng ?? port?.longitude ?? port?.Longitude)
            }))
            .filter(port => Number.isFinite(port.lat) && Number.isFinite(port.lon));
        if (ports.length === 0) return 'Estado N/D';

        const nearestDistanceNm = ports.reduce((nearest, port) => {
            const distanceNm = calculateDistanceToPort(latitude, longitude, port.lat, port.lon);
            return distanceNm === null ? nearest : Math.min(nearest, distanceNm);
        }, Infinity);
        const portRadiusNm = Number.isFinite(Number(options.portRadiusNm)) ? Number(options.portRadiusNm) : 3;
        return nearestDistanceNm < portRadiusNm ? 'En Puerto / Fondeado' : 'En tránsito (Alta mar)';
    }

    function isValidPortText(val) {
        if (val === null || val === undefined) return false;
        const s = String(val).trim().toUpperCase();
        return s !== '' && s !== 'N/A' && s !== 'UNKNOWN' && s !== 'DESCONOCIDO' && s !== '0' && s !== 'NONE' && s !== 'NULL' && s !== 'UNDEFINED' && s !== 'PENDING';
    }

    function getActivePolInfo() {
        if (typeof window === 'undefined') return { polName: '', polLat: null, polLon: null };
        let polName = '';
        let polLat = null;
        let polLon = null;

        if (typeof window.getMatchingExecutionRouteOverride === 'function') {
            try {
                const route = window.getMatchingExecutionRouteOverride();
                if (route) {
                    if (route.pol) polName = String(route.pol).trim();
                    if (route.lat && route.lat.pol !== null && route.lat.pol !== undefined) polLat = Number(route.lat.pol);
                    if (route.lon && route.lon.pol !== null && route.lon.pol !== undefined) polLon = Number(route.lon.pol);
                }
            } catch (_) {}
        }

        if (!polName && typeof document !== 'undefined') {
            polName = String(
                document.getElementById('port-pol')?.value ||
                document.getElementById('map-port-pol')?.value ||
                document.getElementById('match-load-port')?.value ||
                (window.State && window.State.pol) ||
                ''
            ).trim();
        }

        if ((polLat === null || polLon === null || !Number.isFinite(polLat) || !Number.isFinite(polLon)) && typeof document !== 'undefined') {
            const rawLat = document.getElementById('match-load-lat')?.value || (typeof localStorage !== 'undefined' && localStorage.getItem('calculator_pol_lat'));
            const rawLon = document.getElementById('match-load-lon')?.value || (typeof localStorage !== 'undefined' && localStorage.getItem('calculator_pol_lon'));
            const parsedLat = parseFloat(rawLat);
            const parsedLon = parseFloat(rawLon);
            if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon) && !(parsedLat === 0 && parsedLon === 0)) {
                polLat = parsedLat;
                polLon = parsedLon;
            }
        }

        return {
            polName,
            polLat: Number.isFinite(polLat) ? polLat : null,
            polLon: Number.isFinite(polLon) ? polLon : null
        };
    }

    function getGeofencedPortDisplay(ship, routeContext) {
        if (!ship || typeof ship !== 'object') {
            return { destinationDisplay: 'Desconocido / En Navegación', lastPortDisplay: 'Desconocido / En Navegación', distanciaPolNm: null };
        }

        if (ship._geoComputed && ship.destinationDisplay && ship.lastPortDisplay) {
            return {
                destinationDisplay: ship.destinationDisplay,
                lastPortDisplay: ship.lastPortDisplay,
                distanciaPolNm: ship.distanciaPolNm ?? null
            };
        }

        const lat = Number(ship.latitude ?? ship.lat ?? ship.AIS_Live_Lat);
        const lon = Number(ship.longitude ?? ship.lon ?? ship.lng ?? ship.AIS_Live_Lon);

        const rawDest = ship.destination || ship.Destination || ship.plannedDestination || ship.destino_actual || ship.destino;
        const rawLastPort = ship.lastPortOfCall || ship.last_port_of_call || ship.ultimo_puerto || ship.LastPort || ship.lastPort;

        const hasDest = isValidPortText(rawDest);
        const hasLastPort = isValidPortText(rawLastPort);

        let polName = '';
        let polLat = null;
        let polLon = null;

        if (routeContext) {
            polName = routeContext.polName || routeContext.pol || '';
            polLat = routeContext.polLat ?? routeContext.lat?.pol ?? null;
            polLon = routeContext.polLon ?? routeContext.lon?.pol ?? null;
        }

        if (!polName || polLat === null || polLon === null) {
            const activePol = getActivePolInfo();
            polName = polName || activePol.polName;
            if (polLat === null || !Number.isFinite(polLat)) polLat = activePol.polLat;
            if (polLon === null || !Number.isFinite(polLon)) polLon = activePol.polLon;
        }

        const distNm = (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(polLat) && Number.isFinite(polLon))
            ? calculateDistanceToPort(lat, lon, polLat, polLon)
            : null;

        const targetPolLabel = polName ? polName : 'POL';

        let destinationDisplay = '';
        if (hasDest) {
            const cleanDest = String(rawDest).trim();
            if (distNm !== null) {
                destinationDisplay = `${cleanDest} / A ${distNm} NM de ${targetPolLabel}`;
            } else {
                destinationDisplay = cleanDest;
            }
        } else {
            if (distNm !== null) {
                destinationDisplay = `En ruta (a ${distNm} NM de ${targetPolLabel})`;
            } else {
                destinationDisplay = 'Desconocido / En Navegación';
            }
        }

        let lastPortDisplay = '';
        if (hasLastPort) {
            lastPortDisplay = String(rawLastPort).trim();
        } else {
            lastPortDisplay = 'Desconocido / En Navegación';
        }

        ship._geoComputed = true;
        ship.distanciaPolNm = distNm;
        ship.destinationDisplay = destinationDisplay;
        ship.lastPortDisplay = lastPortDisplay;

        return {
            destinationDisplay,
            lastPortDisplay,
            distanciaPolNm: distNm
        };
    }

    function normalizeShipFields(ship) {
        if (!ship || typeof ship !== 'object') return null;
        const sourcePayload = parseAisSourcePayload(ship.source_payload || ship.sourcePayload);
        const message = ship.Message || ship.message || sourcePayload.Message || sourcePayload.message || {};
        const meta = ship.MetaData || ship.metadata || message.MetaData || message.metadata || sourcePayload.MetaData || sourcePayload.metadata || {};
        const position = ship.PositionReport
            || ship.StandardClassBPositionReport
            || ship.ExtendedClassBPositionReport
            || ship.position
            || message.PositionReport
            || message.StandardClassBPositionReport
            || message.ExtendedClassBPositionReport
            || message.position
            || sourcePayload.PositionReport
            || sourcePayload.StandardClassBPositionReport
            || sourcePayload.ExtendedClassBPositionReport
            || sourcePayload.position
            || {};
        const scopes = [ship, sourcePayload, message, meta, position];
        const read = (keys) => {
            for (const scope of scopes) {
                for (const key of keys) {
                    if (scope && scope[key] !== undefined && scope[key] !== null && scope[key] !== '') return scope[key];
                }
            }
            return null;
        };

        const name = firstDefined(read(['vesselName', 'vessel_name', 'ShipName', 'shipName', 'name']), 'Sin nombre');
        const imo = firstDefined(read(['imo', 'IMO', 'imoNumber', 'imo_number']), 'N/A');
        const mmsi = firstDefined(read(['mmsi', 'MMSI']), 'N/A');
        const latitude = normalizeNumeric(read(['latitude', 'lat', 'Latitude', 'AIS_Live_Lat', 'LAT']));
        const longitude = normalizeNumeric(read(['longitude', 'lon', 'lng', 'Longitude', 'AIS_Live_Lon', 'LON', 'LONG']));
        const normalizedGt = normalizeNumeric(read(['GT', 'gt', 'grossTonnage', 'gross_tonnage']));
        const normalizedDwt = normalizeNumeric(read(['DWT_real', 'dwt_real', 'DWT', 'dwt', 'deadweight', 'deadweight_tonnage']));
        const normalizedDraft = normalizeNumeric(read(['Draft', 'draft', 'maxDraft', 'max_draft', 'draft_meters']));
        const speed = readRealVesselSpeed(ship);
        const navigation = resolveAisNavigationCourse(scopes);
        const destination = firstDefined(read(['destination', 'Destination', 'current_destination', 'plannedDestination', 'destino_actual', 'destino', 'dest', 'Dest']), 'N/A');
        const lastPortOfCall = firstDefined(read(['lastPortOfCall', 'last_port_of_call', 'ultimo_puerto', 'LastPort', 'lastPort', 'DeparturePort']), 'N/A');
        const shipType = firstDefined(read(['shipType', 'ShipType', 'vesselType', 'vessel_type', 'type']), 'Unknown');
        const rawIsCompatible = read(['isCompatible']);
        const isCompatible = rawIsCompatible !== null ? Boolean(rawIsCompatible) : (meta.isCompatible !== undefined ? Boolean(meta.isCompatible) : undefined);

        const geoInfo = getGeofencedPortDisplay({
            latitude,
            longitude,
            destination,
            lastPortOfCall
        });

        return {
            ...ship,
            source_payload: sourcePayload,
            MetaData: {
                ...meta,
                isCompatible
            },
            PositionReport: position,
            name: String(name),
            vesselName: String(name),
            ShipName: String(name),
            imo: String(imo),
            IMO: String(imo),
            imo_number: String(imo),
            mmsi: String(mmsi),
            MMSI: String(mmsi),
            latitude: latitude === null ? undefined : latitude,
            longitude: longitude === null ? undefined : longitude,
            lat: latitude === null ? undefined : latitude,
            lon: longitude === null ? undefined : longitude,
            GT: normalizedGt === null ? undefined : normalizedGt,
            gt: normalizedGt === null ? undefined : normalizedGt,
            DWT_real: normalizedDwt === null ? undefined : normalizedDwt,
            DWT: normalizedDwt === null ? undefined : normalizedDwt,
            dwt: normalizedDwt === null ? undefined : normalizedDwt,
            Draft: normalizedDraft === null ? undefined : normalizedDraft,
            draft: normalizedDraft === null ? undefined : normalizedDraft,
            speed: speed === null ? undefined : speed,
            course: navigation.cog === null ? undefined : navigation.cog,
            cog: navigation.cog === null ? undefined : navigation.cog,
            COG: navigation.cog === null ? undefined : navigation.cog,
            heading: navigation.hdg === null ? undefined : navigation.hdg,
            HDG: navigation.hdg === null ? undefined : navigation.hdg,
            navigationCourse: navigation.value === null ? undefined : navigation.value,
            headingSource: navigation.source,
            hasHeading: navigation.value !== null,
            destination: String(destination),
            plannedDestination: String(destination),
            destino_actual: String(destination),
            lastPortOfCall: geoInfo.lastPortDisplay !== 'Desconocido / En Navegación' ? String(lastPortOfCall) : 'Desconocido / En Navegación',
            last_port_of_call: geoInfo.lastPortDisplay !== 'Desconocido / En Navegación' ? String(lastPortOfCall) : 'Desconocido / En Navegación',
            ultimo_puerto: geoInfo.lastPortDisplay !== 'Desconocido / En Navegación' ? String(lastPortOfCall) : 'Desconocido / En Navegación',
            distanciaPolNm: geoInfo.distanciaPolNm,
            destinationDisplay: geoInfo.destinationDisplay,
            lastPortDisplay: geoInfo.lastPortDisplay,
            shipType: String(shipType),
            ShipType: String(shipType),
            vessel_type: String(shipType),
            isCompatible
        };
    }

    function shouldUseExclusiveFleetVisibility(filteredCount) {
        if (typeof window === 'undefined') return false;
        if (!window.GlobalStore || typeof window.GlobalStore.getSelectedTaxonomies !== 'function') return false;
        const selected = window.GlobalStore.getSelectedTaxonomies();
        return Array.isArray(selected) && selected.length > 0 && filteredCount === 0;
    }

    function enrichFleetIntelMatch(normalized) {
        if (!normalized || typeof window === 'undefined') return normalized;
        const globalFleet = Array.isArray(window.fleet) ? window.fleet : [];
        if (globalFleet.length === 0) return normalized;
        const targetKey = vesselKey(normalized);
        if (!targetKey) return normalized;

        const match = globalFleet.find((item) => vesselKey(item) === targetKey);
        if (!match) return normalized;

        return Object.assign({}, match, normalized, {
            vesselName: firstDefined(normalized.vesselName, match.vesselName, match.vessel_name, match.ShipName),
            vesselClass: firstDefined(normalized.vesselClass, match.vesselClass, match.specialtyType, match.vessel_type),
            specialtyType: firstDefined(normalized.specialtyType, match.specialtyType, match.vesselClass),
            dwt: firstDefined(normalized.dwt, match.dwt, match.DWT),
            draft: firstDefined(normalized.draft, match.draft, match.Draft),
            flag: firstDefined(normalized.flag, match.flag, match.bandera),
            builtYear: firstDefined(normalized.builtYear, match.builtYear, match.built_year, match.built)
        });
    }

    function filterByExclusiveFleetVisibility(vessels) {
        const list = Array.isArray(vessels) ? vessels : [];
        if (!shouldUseExclusiveFleetVisibility(list.length)) return list;

        const provider = typeof window !== 'undefined' ? window.GlobalTaxonomyProvider : null;
        return list.filter((vessel) => {
            if (!provider || typeof provider.isVesselMatchingSelectedTaxonomies !== 'function') {
                return false;
            }
            return provider.isVesselMatchingSelectedTaxonomies(vessel);
        });
    }

    function emitHydrationUpdate(vessels, detail) {
        if (isEmittingHydrationUpdate) return;
        isEmittingHydrationUpdate = true;
        try {
            const rawList = Array.isArray(vessels) ? vessels : [];
            const list = filterByExclusiveFleetVisibility(rawList).map(normalizeShipFields).filter(Boolean);
            if (typeof window !== 'undefined' && window.GlobalStore && typeof window.GlobalStore.setFilteredVessels === 'function') {
                window.GlobalStore.setFilteredVessels(list, detail || { source: 'map-loader' });
            }
            if (typeof window !== 'undefined' && typeof window.updateAisMarkers === 'function') {
                window.updateAisMarkers(list);
            }
        } finally {
            isEmittingHydrationUpdate = false;
        }
    }

    function normalizeCoordinates(lat, lon) {
        let nLat, nLon;

        function parseNum(val) {
            if (val === null || val === undefined || val === '') return NaN;
            if (typeof val === 'number') return val;
            if (typeof val === 'string') return parseFloat(val.replace(',', '.').trim());
            return Number(val);
        }

        if (lat && typeof lat === 'object') {
            const v = lat;
            nLat = parseNum(v.latitude ?? v.lat ?? v.LAT ?? v.latitud ?? (v.MetaData && (v.MetaData.latitude ?? v.MetaData.lat)));
            nLon = parseNum(v.longitude ?? v.lon ?? v.lng ?? v.LON ?? v.LONG ?? v.longitud ?? (v.MetaData && (v.MetaData.longitude ?? v.MetaData.lon ?? v.MetaData.lng)));
        } else {
            nLat = parseNum(lat);
            nLon = parseNum(lon);
        }

        if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return null;
        if (nLat < -90 || nLat > 90 || nLon < -180 || nLon > 180) return null;
        if (Math.abs(nLat) < 0.0001 && Math.abs(nLon) < 0.0001) return null;

        const coords = [nLat, nLon];
        coords.lat = nLat;
        coords.lon = nLon;
        coords.lng = nLon;
        coords.latitude = nLat;
        coords.longitude = nLon;
        return coords;
    }

    function isValidWaterPosition(lat, lon) {
        return Boolean(normalizeCoordinates(lat, lon));
    }

    function getViewportQueryUrl(bounds) {
        if (!bounds) return '/api/ais-scan';
        const sw = bounds.getSouthWest ? bounds.getSouthWest() : bounds._southWest;
        const ne = bounds.getNorthEast ? bounds.getNorthEast() : bounds._northEast;
        if (!sw || !ne) return '/api/ais-scan';
        return `/api/ais-scan?sw_lat=${sw.lat}&sw_lon=${sw.lng}&ne_lat=${ne.lat}&ne_lon=${ne.lng}`;
    }

    function getDefaultAisMap() {
        if (typeof window === 'undefined') return null;
        return window.aisMap || window.seacharterMap || window.map || null;
    }

    function hasValidAisBounds(bounds) {
        if (!bounds || typeof bounds !== 'object') return false;
        const swLat = Number(bounds.swLat ?? bounds.minLat ?? bounds.southWestLat);
        const swLon = Number(bounds.swLon ?? bounds.minLon ?? bounds.southWestLon);
        const neLat = Number(bounds.neLat ?? bounds.maxLat ?? bounds.northEastLat);
        const neLon = Number(bounds.neLon ?? bounds.maxLon ?? bounds.northEastLon);
        return [swLat, swLon, neLat, neLon].every(Number.isFinite) && swLat < neLat && swLon < neLon;
    }

    function readLeafletBounds(mapInstance) {
        const targetMap = mapInstance || getDefaultAisMap();
        if (!targetMap || typeof targetMap.getBounds !== 'function') return null;
        try {
            const bounds = targetMap.getBounds();
            if (!bounds) return null;
            const sw = bounds.getSouthWest ? bounds.getSouthWest() : null;
            const ne = bounds.getNorthEast ? bounds.getNorthEast() : null;
            if (!sw || !ne) return null;
            return {
                swLat: Number(sw.lat),
                swLon: Number(sw.lng),
                neLat: Number(ne.lat),
                neLon: Number(ne.lng)
            };
        } catch (_) {
            return null;
        }
    }

    function getLeafletBoundsForProxy(mapInstance) {
        const bounds = readLeafletBounds(mapInstance);
        return hasValidAisBounds(bounds) ? bounds : null;
    }

    function waitForAisMapIdle(mapInstance, callback, timeoutMs) {
        const targetMap = mapInstance || getDefaultAisMap();
        const timeout = timeoutMs || 1500;

        if (!targetMap || typeof targetMap.once !== 'function' || typeof targetMap.isMoving !== 'function') {
            setTimeout(callback, 50);
            return;
        }

        if (!targetMap.isMoving()) {
            setTimeout(callback, 20);
            return;
        }

        let fired = false;
        const complete = () => {
            if (fired) return;
            fired = true;
            callback();
        };

        const timer = setTimeout(complete, timeout);
        targetMap.once('moveend', () => {
            clearTimeout(timer);
            complete();
        });
    }

    function getStableProxyBounds(mapInstance) {
        const bounds = getLeafletBoundsForProxy(mapInstance);
        return bounds ? normalizeAisBounds(bounds) : null;
    }

    function appendProxyBoundsToEndpoint(endpoint, bounds) {
        if (!endpoint || !bounds || !hasValidAisBounds(bounds)) return endpoint || '/api/audit-vessels';
        try {
            const base = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost';
            const url = new URL(endpoint, base);
            url.searchParams.set('sw_lat', String(bounds.swLat));
            url.searchParams.set('sw_lon', String(bounds.swLon));
            url.searchParams.set('ne_lat', String(bounds.neLat));
            url.searchParams.set('ne_lon', String(bounds.neLon));
            return `${url.pathname}${url.search}`;
        } catch (_) {
            return endpoint;
        }
    }

    function getBoundsFromAisStreamBoundingBox(boundingBoxes) {
        if (!Array.isArray(boundingBoxes) || boundingBoxes.length === 0) return null;
        const box = boundingBoxes[0];
        if (!Array.isArray(box) || box.length < 2) return null;
        const sw = box[0];
        const ne = box[1];
        if (!Array.isArray(sw) || sw.length < 2 || !Array.isArray(ne) || ne.length < 2) return null;
        return {
            swLat: Number(sw[0]),
            swLon: Number(sw[1]),
            neLat: Number(ne[0]),
            neLon: Number(ne[1])
        };
    }

    function buildFinalProxyRequestUrl(endpoint, mapInstance) {
        const bounds = getStableProxyBounds(mapInstance);
        if (bounds) return appendProxyBoundsToEndpoint(endpoint, bounds);

        const boundingBoxes = obtenerBoundingBoxesActuales();
        const bboxBounds = getBoundsFromAisStreamBoundingBox(boundingBoxes);
        if (bboxBounds) return appendProxyBoundsToEndpoint(endpoint, bboxBounds);

        return endpoint;
    }

    function getProxyBoundsPayload(bounds) {
        const normalized = normalizeAisBounds(bounds);
        if (!normalized || !hasValidAisBounds(normalized)) return null;
        return {
            sw_lat: normalized.swLat,
            sw_lon: normalized.swLon,
            ne_lat: normalized.neLat,
            ne_lon: normalized.neLon
        };
    }

    function normalizeAisBounds(bounds) {
        if (!bounds || typeof bounds !== 'object') return null;
        const swLat = Number(bounds.swLat ?? bounds.minLat ?? bounds.southWestLat);
        const swLon = Number(bounds.swLon ?? bounds.minLon ?? bounds.southWestLon);
        const neLat = Number(bounds.neLat ?? bounds.maxLat ?? bounds.northEastLat);
        const neLon = Number(bounds.neLon ?? bounds.maxLon ?? bounds.northEastLon);
        if (![swLat, swLon, neLat, neLon].every(Number.isFinite)) return null;
        return {
            swLat: Number(swLat.toFixed(4)),
            swLon: Number(swLon.toFixed(4)),
            neLat: Number(neLat.toFixed(4)),
            neLon: Number(neLon.toFixed(4))
        };
    }

    function getAisBoundsKey(bounds) {
        const normalized = normalizeAisBounds(bounds);
        if (!normalized) return '';
        return [normalized.swLat, normalized.swLon, normalized.neLat, normalized.neLon].join(':');
    }

    function setAisStreamBounds(bounds) {
        const normalized = normalizeAisBounds(bounds);
        if (!normalized || !hasValidAisBounds(normalized)) return false;

        const nextKey = getAisBoundsKey(normalized);
        if (aisStreamState.boundsKey === nextKey) return false;

        aisStreamState.currentBounds = normalized;
        aisStreamState.boundsKey = nextKey;
        return true;
    }

    function setAisStreamBoundsFromLeafletBounds(mapInstance) {
        const bounds = readLeafletBounds(mapInstance);
        return setAisStreamBounds(bounds);
    }

    function obtenerBoundingBoxesActuales() {
        if (aisStreamState.currentBounds && hasValidAisBounds(aisStreamState.currentBounds)) {
            const b = aisStreamState.currentBounds;
            return [[
                [b.swLat, b.swLon],
                [b.neLat, b.neLon]
            ]];
        }
        return [[
            [-90.0, -180.0],
            [90.0, 180.0]
        ]];
    }

    function getAisStreamSubscriptionPayload() {
        const key = getAisStreamApiKey();
        if (!key) return null;
        const payload = {
            APIKey: key,
            BoundingBoxes: Array.isArray(aisStreamState.options.boundingBoxes)
                ? aisStreamState.options.boundingBoxes
                : obtenerBoundingBoxesActuales(),
            FilterMessageTypes: ["PositionReport", "ShipStaticData"]
        };
        const mmsi = String(aisStreamState.options.mmsi || '').replace(/\D/g, '');
        if (mmsi.length === 9) payload.FiltersShipMMSI = [mmsi];
        return payload;
    }

    function getAisStreamApiKey() {
        if (aisStreamState.apiKey) return aisStreamState.apiKey;
        if (typeof window !== 'undefined') {
            const explicit = window.AISSTREAM_API_KEY || window.aisstreamApiKey || '';
            if (explicit) return String(explicit).trim();
            try {
                return String(localStorage.getItem('aisstream_api_key') || '').trim();
            } catch (_) {}
        }
        return '';
    }

    function pollAisProxyOnce(endpoint, mapInstance) {
        if (typeof fetch !== 'function') return Promise.resolve(null);
        if (typeof window !== 'undefined' && window.shouldBlockSecondaryFleetSources?.()) {
            stopAisProxyPolling();
            return Promise.resolve(null);
        }
        if (aisProxyPollingState.inFlight) return Promise.resolve(null);

        aisProxyPollingState.inFlight = true;
        const targetEndpoint = endpoint || aisProxyPollingState.endpoint || '/api/audit-vessels';
        const finalUrl = buildFinalProxyRequestUrl(targetEndpoint, mapInstance);

        return fetch(finalUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
        .then((res) => res.json())
        .then((data) => {
            aisProxyPollingState.inFlight = false;
            aisProxyPollingState.retryIndex = 0;
            const rawShips = (data && Array.isArray(data.vessels)) ? data.vessels : (Array.isArray(data) ? data : []);
            const ships = Array.isArray(rawShips) ? rawShips.map(normalizeShipFields) : [];
            if (ships.length > 0) {
                emitHydrationUpdate(ships, { source: 'ais-proxy-poll', count: ships.length });
            }
            return data;
        })
        .catch((err) => {
            aisProxyPollingState.inFlight = false;
            console.warn('[SeaCharter AIS] AIS proxy polling encountered a transient issue:', err);
            return null;
        });
    }

    function startAisProxyPolling(endpoint, mapInstance, options) {
        if (typeof window !== 'undefined' && window.shouldBlockSecondaryFleetSources?.()) {
            stopAisProxyPolling();
            return { started: false, reason: window.hasPriorityOpenShipsData?.() ? 'openships-priority-active' : 'openships-priority-pending' };
        }
        const opts = options || {};
        aisProxyPollingState.endpoint = endpoint || aisProxyPollingState.endpoint;
        aisProxyPollingState.map = mapInstance || aisProxyPollingState.map || getDefaultAisMap();
        aisProxyPollingState.intervalMs = Number(opts.intervalMs) || aisProxyPollingState.intervalMs;
        aisProxyPollingState.userActivated = true;

        if (aisProxyPollingState.timer) {
            clearInterval(aisProxyPollingState.timer);
            aisProxyPollingState.timer = null;
        }

        const runPoll = () => {
            waitForAisMapIdle(aisProxyPollingState.map, () => {
                pollAisProxyOnce(aisProxyPollingState.endpoint, aisProxyPollingState.map);
            });
        };

        runPoll();
        aisProxyPollingState.timer = setInterval(runPoll, aisProxyPollingState.intervalMs);
    }

    function stopAisProxyPolling() {
        if (aisProxyPollingState.timer) {
            clearInterval(aisProxyPollingState.timer);
            aisProxyPollingState.timer = null;
        }
        aisProxyPollingState.inFlight = false;
        aisProxyPollingState.userActivated = false;
    }

    function resetAisCache() {
        hydrationInFlight.clear();
        hydrationCache.clear();
    }

    function actualizarSuscripcionRadarAIS() {
        if (!aisStreamState.ws || aisStreamState.ws.readyState !== 1) return false;
        const payload = getAisStreamSubscriptionPayload();
        if (!payload) return false;
        try {
            aisStreamState.ws.send(JSON.stringify(payload));
            return true;
        } catch (_) {
            return false;
        }
    }

    function bindAisMapMovementSync(mapInstance) {
        const targetMap = mapInstance || getDefaultAisMap();
        if (!targetMap || typeof targetMap.on !== 'function') return;

        aisStreamState.boundMap = targetMap;
        aisProxyPollingState.map = targetMap;

        const onMoveEnd = () => {
            if (aisStreamState.mapMoveTimer) clearTimeout(aisStreamState.mapMoveTimer);
            aisStreamState.mapMoveTimer = setTimeout(() => {
                const changed = setAisStreamBoundsFromLeafletBounds(targetMap);
                if (changed && aisStreamState.ws && aisStreamState.ws.readyState === 1) {
                    actualizarSuscripcionRadarAIS();
                }
            }, 300);
        };

        targetMap.on('moveend', onMoveEnd);
    }

    function closeAisStreamSocket() {
        aisStreamState.shouldReconnect = false;
        if (aisStreamState.reconnectTimer) {
            clearTimeout(aisStreamState.reconnectTimer);
            aisStreamState.reconnectTimer = null;
        }
        if (aisStreamState.ws) {
            try { aisStreamState.ws.close(); } catch (_) {}
            aisStreamState.ws = null;
        }
    }

    function startPersistentAisStream(endpoint, apiKey, mapInstance, options) {
        closeAisStreamSocket();

        if (endpoint && typeof endpoint === 'object') {
            options = endpoint;
            endpoint = options.endpoint;
            apiKey = options.apiKey;
            mapInstance = options.map;
        }

        aisStreamState.endpoint = endpoint || aisStreamState.endpoint || 'wss://stream.aisstream.io/v0/stream';
        aisStreamState.apiKey = apiKey || getAisStreamApiKey();
        aisStreamState.options = options || {};
        aisStreamState.shouldReconnect = true;

        if (mapInstance) {
            bindAisMapMovementSync(mapInstance);
            setAisStreamBoundsFromLeafletBounds(mapInstance);
        }

        const payload = getAisStreamSubscriptionPayload();
        if (!payload || !payload.APIKey) {
            aisStreamState.shouldReconnect = false;
            console.warn('[SeaCharter AIS] Missing browser AISStream API Key; Tracking live socket was not started.');
            return { started: false, reason: 'missing-client-api-key' };
        }
        if (!Array.isArray(payload.FiltersShipMMSI) || payload.FiltersShipMMSI.length !== 1) {
            aisStreamState.shouldReconnect = false;
            console.warn('[SeaCharter AIS] Tracking requires one valid MMSI before opening AISStream.');
            return { started: false, reason: 'tracking-mmsi-required' };
        }

        try {
            const ws = new WebSocket(aisStreamState.endpoint);
            aisStreamState.ws = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify(payload));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (!data) return;
                    const ship = normalizeShipFields(data);
                    if (ship) {
                        window.dispatchEvent(new CustomEvent('tracking:aisstream-update', {
                            detail: { vessel: ship, mmsi: ship.mmsi, source: 'aisstream-client' }
                        }));
                        emitHydrationUpdate([ship], { source: 'aisstream-live', mmsi: ship.mmsi });
                    }
                } catch (_) {}
            };

            ws.onerror = () => {
                ws.close();
            };

            ws.onclose = () => {
                aisStreamState.ws = null;
                if (aisStreamState.shouldReconnect && !aisStreamState.reconnectTimer) {
                    aisStreamState.reconnectTimer = setTimeout(() => {
                        aisStreamState.reconnectTimer = null;
                        startPersistentAisStream(aisStreamState.endpoint, aisStreamState.apiKey, aisStreamState.boundMap, aisStreamState.options);
                    }, aisStreamState.reconnectDelayMs);
                }
            };
        } catch (err) {
            aisStreamState.shouldReconnect = false;
            console.warn('[SeaCharter AIS] Tracking WebSocket creation failed.', err);
            return { started: false, reason: 'websocket-creation-failed' };
        }
        return { started: true, mmsi: payload.FiltersShipMMSI[0] };
    }

    const activeMarkers = new Map();

    function autoHydrate(shipList) {
        const ships = Array.isArray(shipList) ? shipList.map(normalizeShipFields).filter(Boolean) : [];
        if (ships.length === 0) return;
        emitHydrationUpdate(ships, { source: 'auto-hydrate' });
    }

    function escapePopupText(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function buildTargetPopupHtml(options) {
        if (!options || typeof options !== 'object') return '';
        const targetLat = normalizeNumeric(options.targetLat ?? options.loadingPortLat);
        const targetLon = normalizeNumeric(options.targetLon ?? options.loadingPortLon);
        const targetName = options.targetName || options.loadingPortName || 'POL Target';
        if (targetLat === null || targetLon === null) return '';

        const shipLat = normalizeNumeric(options.latitude ?? options.lat);
        const shipLon = normalizeNumeric(options.longitude ?? options.lon);
        let distHtml = '';

        if (shipLat !== null && shipLon !== null) {
            const distNm = calculateDistanceToPort(shipLat, shipLon, targetLat, targetLon);
            if (distNm !== null) {
                distHtml = `<br><span>Distancia a ${escapePopupText(targetName)}: <strong>${distNm} NM</strong></span>`;
            }
        }

        return `${distHtml}`;
    }

    function setupAisMarkerPopup(marker, options) {
        if (!marker || typeof marker.bindPopup !== 'function') return;
        const name = escapePopupText(getVesselDisplayName(options));
        const imo = escapePopupText(firstDefined(options.imo, options.IMO, 'N/A'));
        const mmsi = escapePopupText(firstDefined(options.mmsi, options.MMSI, 'N/A'));
        const statusLabel = escapePopupText(options.statusLabel || (options.is_estimated ? 'Estimado' : 'Tiempo real'));

        if (options.is_estimated) {
            const estContent = `<div class="seacharter-map-popup"><strong>${name}</strong><span>IMO: ${imo}</span><span>MMSI: ${mmsi}</span><span>Ubicación: ${statusLabel}</span><br><span style="color: #f59e0b; font-weight: bold;">⚠️ Coordenada Estrapolada</span>${buildTargetPopupHtml(options)}</div>`;
            marker.bindPopup(estContent);
        } else {
            const destination = escapePopupText(options.destinationDisplay || options.destination || "N/A");
            const lastPortOfCall = escapePopupText(options.lastPortDisplay || options.lastPortOfCall || options.last_port_of_call || options.ultimo_puerto || "N/A");
            const normalContent = `<div class="seacharter-map-popup"><strong>${name}</strong><span>IMO: ${imo}</span><span>MMSI: ${mmsi}</span><span>Destino: ${destination}</span><span>Último puerto: ${lastPortOfCall}</span><span>Ubicación: ${statusLabel}</span>${buildTargetPopupHtml(options)}</div>`;
            marker.bindPopup(normalContent);
        }
    }

    function getAisDynamicIcon(options) {
        if (typeof L === 'undefined' || !L || typeof L.divIcon !== 'function') return null;
        const isComp = Boolean(options && (options.isCompatible || options.is_compatible));
        const isEst = Boolean(options && options.is_estimated);
        const cssClass = isComp ? 'ais-marker-compatible' : (isEst ? 'ais-marker-estimated' : 'ais-marker-standard');
        return L.divIcon({
            className: `seacharter-ais-marker ${cssClass}`,
            html: '<div class="marker-dot"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });
    }

    async function registerVesselManually(shipData, mapInstance) {
        if (!shipData || typeof shipData !== 'object') return;
        const name = shipData.vessel_name || shipData.name || 'Sin nombre';
        const mmsi = shipData.mmsi || 'N/A';
        const imo = shipData.imo || 'N/A';
        const destination = shipData.destination || 'N/A';

        try {
            const res = await fetch('/api/vessels', {
                method: 'POST',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                },
                body: JSON.stringify({ vessel_name: name, mmsi, imo, destination })
            });
            const resData = await res.json();
            if (resData.success) {
                const hydrated = Object.assign({}, shipData, { is_estimated: true, statusLabel: 'Registrado Manual' });
                emitHydrationUpdate([hydrated], { source: 'manual-register' });
                if (typeof showToast === 'function') {
                    showToast(`⚓ Vessel "${name}" registered successfully!`);
                } else if (typeof window.showToast === 'function') {
                    window.showToast(`⚓ Vessel "${name}" registered successfully!`);
                } else {
                    alert(`⚓ Vessel "${name}" registered successfully!`);
                }
            } else {
                if (typeof showToast === 'function') {
                    showToast(`⚠️ Error registering vessel: ${resData.error || 'Unknown'}`);
                } else if (typeof window.showToast === 'function') {
                    window.showToast(`⚠️ Error registering vessel: ${resData.error || 'Unknown'}`);
                } else {
                    alert(`⚠️ Error registering vessel: ${resData.error || 'Unknown'}`);
                }
            }
        } catch (err) {
            console.error("Error registering vessel manually:", err);
            alert("⚠️ Network error registering vessel.");
        }
    }

    const exportsObj = {
        normalizeCoordinates,
        getMapStyleConfig,
        createUnifiedMap,
        createFallbackLeafletMap,
        getMapboxStyle,
        isValidWaterPosition,
        getViewportQueryUrl,
        setupAisMarkerPopup,
        getAisDynamicIcon,
        obtenerIconoDinamico: getAisDynamicIcon,
        registerVesselManually,
        autoHydrate,
        isCommercialVessel,
        filterCommercialVessels,
        normalizeShipFields,
        resolveAisNavigationCourse,
        emitHydrationUpdate,
        setAisStreamBounds,
        setAisStreamBoundsFromLeafletBounds,
        obtenerBoundingBoxesActuales,
        actualizarSuscripcionRadarAIS,
        bindAisMapMovementSync,
        getAisStreamSubscriptionPayload,
        getAisStreamApiKey,
        getProxyBoundsPayload,
        readLeafletBounds,
        startPersistentAisStream,
        closeAisStreamSocket,
        startAisProxyPolling,
        stopAisProxyPolling,
        resetAisCache,
        pollAisProxyOnce,
        searchNodes,
        getSearchNodesForPort,
        calculateDistanceToPort,
        readRealVesselSpeed,
        inferSpatialVesselStatus,
        getGeofencedPortDisplay,
        getActivePolInfo,
        _aisStreamState: aisStreamState,
        _aisProxyPollingState: aisProxyPollingState
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exportsObj;
    }
    if (typeof window !== 'undefined') {
        window.MapLoader = exportsObj;
        window.resetAisCache = resetAisCache;
        window.styleConfig = MAP_STYLE_CONFIG;
        window.SEA_MAP_STYLE_CONFIG = MAP_STYLE_CONFIG;
        window.calculateDistanceToPort = calculateDistanceToPort;
        window.readRealVesselSpeed = readRealVesselSpeed;
        window.inferSpatialVesselStatus = inferSpatialVesselStatus;
        window.getGeofencedPortDisplay = getGeofencedPortDisplay;
        window.getActivePolInfo = getActivePolInfo;
    }
})();
