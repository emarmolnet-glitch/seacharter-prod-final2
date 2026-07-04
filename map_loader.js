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
        options: {}
    };
    const aisProxyPollingState = {
        timer: null,
        inFlight: false,
        intervalMs: 300000,
        retryIndex: 0,
        retryDelaysMs: [5000, 10000, 30000],
        userActivated: false,
        endpoint: '/.netlify/functions/get-vessels?force=1',
        map: null,
        waitingForMapIdle: false
    };
    const operationalRegionLayerState = {
        layer: null,
        key: ''
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

    function normalizeShipFields(ship) {
        if (!ship) return ship;
        const meta = ship.MetaData || {};

        const gt = firstDefined(ship.GT, ship.gt, ship.grossTonnage, ship.gross_tonnage, meta.GT, meta.gt, meta.grossTonnage, meta.gross_tonnage);
        const dwtReal = firstDefined(ship.DWT_real, ship.dwt_real, ship.DWT, ship.dwt, meta.DWT_real, meta.dwt_real, meta.DWT, meta.dwt);
        const draft = firstDefined(ship.Draft, ship.draft, ship.maxDraft, ship.max_draft, meta.Draft, meta.draft, meta.maxDraft, meta.max_draft);

        const normalizedGt = normalizeNumeric(gt);
        const normalizedDwt = normalizeNumeric(dwtReal);
        const normalizedDraft = normalizeNumeric(draft);

        if (normalizedGt !== null) {
            ship.GT = normalizedGt;
            ship.gt = normalizedGt;
        }
        if (normalizedDwt !== null) {
            ship.DWT_real = normalizedDwt;
            ship.DWT = normalizedDwt;
            ship.dwt = normalizedDwt;
        }
        if (normalizedDraft !== null) {
            ship.Draft = normalizedDraft;
            ship.draft = normalizedDraft;
        }

        return ship;
    }

    function shouldUseExclusiveFleetVisibility() {
        if (typeof window === 'undefined') return false;
        if (window.fleetIntelExclusiveVisibility === true) return true;
        try {
            return localStorage.getItem('fleet_intel_exclusive_visibility') === '1';
        } catch (_) {
            return false;
        }
    }

    function enrichFleetIntelMatch(ship) {
        const vessel = ship || {};
        if (
            typeof window !== "undefined" &&
            window.FleetManager &&
            typeof window.FleetManager.isTarget === "function"
        ) {
            const matched = window.FleetManager.isTarget(vessel);
            vessel.isTarget = matched;
            vessel.fleetIntelMatch = matched;
            if (matched && typeof window.FleetManager.getVesselData === "function") {
                vessel.fleetIntelRecord = window.FleetManager.getVesselData(vessel);
            }
        }
        return vessel;
    }

    function filterByExclusiveFleetVisibility(vessels) {
        const list = (Array.isArray(vessels) ? vessels : []).filter(Boolean).map(enrichFleetIntelMatch);
        if (!shouldUseExclusiveFleetVisibility()) return list;
        return list.filter((ship) => ship && (ship.isTarget || ship.fleetIntelMatch));
    }

    function emitHydrationUpdate(vessels, detail) {
        if (typeof window === 'undefined') return;
        if (isEmittingHydrationUpdate) return;

        const list = filterByExclusiveFleetVisibility(vessels).map(normalizeShipFields);
        const store = window.GlobalStore;

        isEmittingHydrationUpdate = true;
        window.isAisHydrationSyncing = true;
        try {
            if (store) {
                const currentRaw = Array.isArray(store.rawVessels) ? store.rawVessels : [];
                const currentRenderable = Array.isArray(store.vessels) ? store.vessels : [];
                const byKey = {};

                currentRaw.concat(currentRenderable).forEach((ship) => {
                    const key = vesselKey(ship);
                    if (key) byKey[key] = ship;
                });

                list.forEach((ship) => {
                    const key = vesselKey(ship);
                    if (key) byKey[key] = Object.assign({}, byKey[key] || {}, ship);
                });

                const merged = Object.values(byKey);
                store.rawVessels = merged;
                store.vessels = merged;
                if (typeof store.setVessels === 'function') {
                    store.setVessels(merged);
                }
                if (typeof store.setRawVessels === 'function') {
                    store.setRawVessels(merged);
                }
            }

            if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
                window.dispatchEvent(new CustomEvent('ais:vessels-hydrated', {
                    detail: Object.assign({ vessels: list }, detail || {})
                }));
                window.dispatchEvent(new CustomEvent('ais:vessels-updated', {
                    detail: Object.assign({ vessels: list }, detail || {})
                }));
            }
        } finally {
            window.isAisHydrationSyncing = false;
            isEmittingHydrationUpdate = false;
        }
    }

    /**
     * Coordinate Normalization: Normalizes latitude and longitude coordinates.
     * Change reading from Port_Registro_Lat/Lon to AIS_Live_Lat/Lon.
     * Ensures correct [Lat, Lon] format order to prevent land inversion.
     * 
     * @param {Object} ship The vessel data object
     * @returns {Array|null} Normalized coordinate array [Lat, Lon] or null if invalid
     */
    function normalizeCoordinates(ship) {
        if (!ship) return null;
        normalizeShipFields(ship);

        // Try reading AIS_Live_Lat/Lon, falling back to Port_Registro_Lat/Lon, and then standard fields
        let lat = ship.AIS_Live_Lat !== undefined ? ship.AIS_Live_Lat : 
                  (ship.MetaData && ship.MetaData.AIS_Live_Lat !== undefined ? ship.MetaData.AIS_Live_Lat : 
                  (ship.Port_Registro_Lat !== undefined ? ship.Port_Registro_Lat : 
                  (ship.MetaData && ship.MetaData.Port_Registro_Lat !== undefined ? ship.MetaData.Port_Registro_Lat : 
                  (ship.latitude !== undefined ? ship.latitude : 
                  (ship.MetaData && ship.MetaData.latitude !== undefined ? ship.MetaData.latitude : null)))));

        let lon = ship.AIS_Live_Lon !== undefined ? ship.AIS_Live_Lon : 
                  (ship.MetaData && ship.MetaData.AIS_Live_Lon !== undefined ? ship.MetaData.AIS_Live_Lon : 
                  (ship.Port_Registro_Lon !== undefined ? ship.Port_Registro_Lon : 
                  (ship.MetaData && ship.MetaData.Port_Registro_Lon !== undefined ? ship.MetaData.Port_Registro_Lon : 
                  (ship.longitude !== undefined ? ship.longitude : 
                  (ship.MetaData && ship.MetaData.longitude !== undefined ? ship.MetaData.longitude : null)))));

        if (lat === null || lon === null) return null;

        let parsedLat = parseFloat(lat);
        let parsedLon = parseFloat(lon);

        if (isNaN(parsedLat) || isNaN(parsedLon)) return null;

        // Prevent Land Inversion check:
        // Leaflet expects [latitude, longitude]. In our geographic scope (Mediterranean / North Africa),
        // Latitude is generally between 30 and 46, and Longitude is between -6 and 36.
        // If they are swapped (e.g. parsedLat is negative/low and parsedLon is high), 
        // we detect and auto-correct it to avoid projecting ships onto the land.
        if (Math.abs(parsedLat) < 15 && Math.abs(parsedLon) > 25) {
            const temp = parsedLat;
            parsedLat = parsedLon;
            parsedLon = temp;
        }

        return [parsedLat, parsedLon];
    }

    /**
     * Position Filtering: Validation function that discards any coordinates
     * that do not fall within a body of water or that are linked to an office/port point.
     * 
     * @param {number} lat Latitude
     * @param {number} lon Longitude
     * @returns {boolean} True if position is in water and not an office or port point
     */
    function isValidWaterPosition(lat, lon) {
        if (isNaN(lat) || isNaN(lon)) return false;

        // 1. Known office or port points to discard (exact or very close coordinates)
        const restrictedPoints = [
            { lat: 39.46, lon: -0.31, name: "Valencia Port" },
            { lat: 39.46, lon: -0.37, name: "Valencia Office" },
            { lat: 41.38, lon: 2.18, name: "Barcelona Port/Office" },
            { lat: 36.13, lon: -5.45, name: "Algeciras Port" },
            { lat: 44.41, lon: 8.92, name: "Genoa Port" },
            { lat: 37.94, lon: 23.64, name: "Piraeus Port" },
            { lat: 35.12, lon: 14.51, name: "Malta Office" },
            { lat: 36.14, lon: -5.35, name: "Gibraltar Port" }
        ];

        for (const pt of restrictedPoints) {
            const dLat = Math.abs(lat - pt.lat);
            const dLon = Math.abs(lon - pt.lon);
            // If within ~500 meters of an office/port, discard it as it's not "at sea" / "live in water"
            if (dLat < 0.005 && dLon < 0.005) {
                return false;
            }
        }

        // 2. Mediterranean region inland boundary filtering (simple but effective water heuristic)
        // Inland Spain
        if (lat > 36.5 && lat < 43.5 && lon > -9.0 && lon < -1.5) {
            return false;
        }
        // Inland Africa (Morocco / Algeria / Tunisia)
        if (lat < 35.0 && lon > -10.0 && lon < 11.0) {
            // Keep coastal zone within 0.1 deg
            if (lat < 34.8) {
                return false;
            }
        }
        // Inland France
        if (lat > 43.8 && lat < 50.0 && lon > -5.0 && lon < 8.2) {
            return false;
        }
        // Inland Italy
        if (lat > 41.0 && lat < 46.5 && lon > 12.0 && lon < 16.5) {
            return false;
        }

        // 3. Sanity coordinates range check
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return false;
        }

        return true;
    }

    /**
     * Bypasses the 300 NM local restriction in the frontend and forms a viewport query URL.
     * 
     * @param {Object} map Leaflet map object
     * @param {string} mode Operation mode
     * @returns {string} Dynamic URL with viewport bounds
     */
    function getViewportQueryUrl(map, mode) {
        let url = `/.netlify/functions/get-vessels?mode=${mode}`;
        const currentBounds = getLeafletBoundsForProxy(map);
        if (currentBounds) {
            url = appendProxyBoundsToEndpoint(url, currentBounds);
        }
        return url;
    }

    function getDefaultAisMap() {
        if (typeof window === 'undefined') return null;
        return window.AISmap || window.aisMap || window.mapaAIS || window.mapAIS || window.map || null;
    }

    function hasValidAisBounds(bounds) {
        if (!bounds) return false;
        const values = [bounds.latMin, bounds.latMax, bounds.lonMin, bounds.lonMax].map(Number);
        if (values.some((value) => !Number.isFinite(value))) return false;
        if (values[0] < -90 || values[1] > 90 || values[2] < -180 || values[3] > 180) return false;
        return values[0] !== values[1] && values[2] !== values[3];
    }

    function readLeafletBounds(bounds) {
        if (!bounds) return null;

        let minLat;
        let maxLat;
        let minLon;
        let maxLon;

        if (
            typeof bounds.getSouth === 'function' &&
            typeof bounds.getNorth === 'function' &&
            typeof bounds.getWest === 'function' &&
            typeof bounds.getEast === 'function'
        ) {
            minLat = bounds.getSouth();
            maxLat = bounds.getNorth();
            minLon = bounds.getWest();
            maxLon = bounds.getEast();
        } else if (typeof bounds.getSouthWest === 'function' && typeof bounds.getNorthEast === 'function') {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            minLat = sw && sw.lat;
            maxLat = ne && ne.lat;
            minLon = sw && (sw.lng !== undefined ? sw.lng : sw.lon);
            maxLon = ne && (ne.lng !== undefined ? ne.lng : ne.lon);
        }

        const normalized = normalizeAisBounds({
            latMin: minLat,
            latMax: maxLat,
            lonMin: minLon,
            lonMax: maxLon
        });

        return hasValidAisBounds(normalized) ? normalized : null;
    }

    function getLeafletBoundsForProxy(mapInstance) {
        const targetMap = mapInstance || getDefaultAisMap();
        if (!targetMap || typeof targetMap.getBounds !== 'function') return null;
        try {
            const leafletBounds = targetMap.getBounds();
            const normalized = readLeafletBounds(leafletBounds);
            if (!normalized) return null;
            return setAisStreamBounds(normalized);
        } catch (_) {
            return null;
        }
    }

    function waitForAisMapIdle(mapInstance) {
        return Promise.resolve();
    }

    async function getStableProxyBounds(mapInstance) {
        let bounds = getLeafletBoundsForProxy(mapInstance);
        if (bounds) return bounds;
        if (aisProxyPollingState.waitingForMapIdle) return null;

        aisProxyPollingState.waitingForMapIdle = true;
        try {
            await waitForAisMapIdle(mapInstance);
            bounds = getLeafletBoundsForProxy(mapInstance);
            return bounds;
        } finally {
            aisProxyPollingState.waitingForMapIdle = false;
        }
    }

    function appendProxyBoundsToEndpoint(endpoint, bounds) {
        const normalized = normalizeAisBounds(bounds);
        if (!normalized || !hasValidAisBounds(normalized)) return endpoint;
        const separator = endpoint.includes('?') ? '&' : '?';
        return `${endpoint}${separator}minLat=${encodeURIComponent(normalized.latMin)}&minLon=${encodeURIComponent(normalized.lonMin)}&maxLat=${encodeURIComponent(normalized.latMax)}&maxLon=${encodeURIComponent(normalized.lonMax)}`;
    }

    function getBoundsFromAisStreamBoundingBox(bounds) {
        const boxes = bounds && (bounds.aisStreamBoundingBox || bounds.aisStreamBoundingBoxes);
        const box = Array.isArray(boxes) ? boxes[0] : null;
        if (!Array.isArray(box) || !Array.isArray(box[0]) || !Array.isArray(box[1])) return null;

        const firstLat = normalizeNumeric(box[0][0]);
        const firstLon = normalizeNumeric(box[0][1]);
        const secondLat = normalizeNumeric(box[1][0]);
        const secondLon = normalizeNumeric(box[1][1]);
        const firstLooksLikeLatLon = firstLat !== null && secondLat !== null && Math.abs(firstLat) <= 90 && Math.abs(secondLat) <= 90;
        const firstLooksLikeLonLat = firstLon !== null && secondLon !== null && Math.abs(firstLon) <= 90 && Math.abs(secondLon) <= 90;

        if (firstLooksLikeLatLon) {
            return {
                latMin: firstLat,
                lonMin: firstLon,
                latMax: secondLat,
                lonMax: secondLon
            };
        }

        if (firstLooksLikeLonLat) {
            return {
                latMin: firstLon,
                lonMin: firstLat,
                latMax: secondLon,
                lonMax: secondLat
            };
        }

        return null;
    }

    function buildFinalProxyRequestUrl(endpoint, bounds) {
        const explicitBounds = bounds && bounds.query ? bounds.query : bounds;
        const normalized = normalizeAisBounds(explicitBounds) || normalizeAisBounds(getBoundsFromAisStreamBoundingBox(bounds));
        return appendProxyBoundsToEndpoint(endpoint, normalized);
    }

    function getProxyBoundsPayload(bounds) {
        const normalized = normalizeAisBounds(bounds);
        if (!normalized || !hasValidAisBounds(normalized)) return null;

        return {
            query: {
                minLat: normalized.latMin,
                minLon: normalized.lonMin,
                maxLat: normalized.latMax,
                maxLon: normalized.lonMax
            },
            corners: {
                southWest: { lat: normalized.latMin, lon: normalized.lonMin },
                southEast: { lat: normalized.latMin, lon: normalized.lonMax },
                northWest: { lat: normalized.latMax, lon: normalized.lonMin },
                northEast: { lat: normalized.latMax, lon: normalized.lonMax }
            },
            aisStreamBoundingBoxes: [
                [
                    [normalized.latMin, normalized.lonMin],
                    [normalized.latMax, normalized.lonMax]
                ]
            ]
        };
    }

    function normalizeAisBounds(bounds) {
        if (!bounds) return null;
        const latMin = normalizeNumeric(bounds.latMin !== undefined ? bounds.latMin : bounds.minLat);
        const latMax = normalizeNumeric(bounds.latMax !== undefined ? bounds.latMax : bounds.maxLat);
        const lonMin = normalizeNumeric(bounds.lonMin !== undefined ? bounds.lonMin : bounds.minLon);
        const lonMax = normalizeNumeric(bounds.lonMax !== undefined ? bounds.lonMax : bounds.maxLon);
        if (latMin === null || latMax === null || lonMin === null || lonMax === null) return null;
        return {
            latMin: Math.min(latMin, latMax),
            latMax: Math.max(latMin, latMax),
            lonMin: Math.min(lonMin, lonMax),
            lonMax: Math.max(lonMin, lonMax)
        };
    }

    function getAisBoundsKey(bounds) {
        return [
            bounds.lonMin,
            bounds.latMin,
            bounds.lonMax,
            bounds.latMax
        ].map((value) => Number(value).toFixed(4)).join(',');
    }

    function setAisStreamBounds(bounds) {
        const normalized = normalizeAisBounds(bounds);
        if (!normalized) return null;
        aisStreamState.currentBounds = normalized;
        aisStreamState.boundsKey = getAisBoundsKey(normalized);
        return normalized;
    }

    function setAisStreamBoundsFromLeafletBounds(bounds) {
        return setAisStreamBounds(readLeafletBounds(bounds));
    }

    function clearOperationalRegionLayer(mapInstance) {
        const targetMap = mapInstance || getDefaultAisMap();
        if (operationalRegionLayerState.layer && targetMap && typeof targetMap.removeLayer === 'function') {
            try {
                targetMap.removeLayer(operationalRegionLayerState.layer);
            } catch (_) {}
        }
        operationalRegionLayerState.layer = null;
        operationalRegionLayerState.key = '';
        return { cleared: true };
    }

    function renderOperationalRegionLayer(mapInstance, targets, options) {
        const targetMap = mapInstance || getDefaultAisMap();
        const nodes = (Array.isArray(targets) ? targets : [])
            .filter((target) => target && target.source === 'NODE' && Number.isFinite(Number(target.lat)) && Number.isFinite(Number(target.lon)));

        if (!targetMap || typeof L === 'undefined' || !L || typeof L.layerGroup !== 'function') {
            return { rendered: false, reason: 'leaflet-map-unavailable', nodeCount: nodes.length };
        }

        const key = nodes
            .map((node) => [
                node.role || '',
                node.name || '',
                Number(node.lat).toFixed(4),
                Number(node.lon).toFixed(4)
            ].join(':'))
            .join('|');
        if (operationalRegionLayerState.layer && operationalRegionLayerState.key === key) {
            return { rendered: true, unchanged: true, nodeCount: nodes.length };
        }

        clearOperationalRegionLayer(targetMap);
        if (!nodes.length) {
            return { rendered: false, reason: 'no-operational-nodes', nodeCount: 0 };
        }

        const layer = L.layerGroup();
        const portTargets = (Array.isArray(targets) ? targets : [])
            .filter((target) => target && target.source === 'PORT' && Number.isFinite(Number(target.lat)) && Number.isFinite(Number(target.lon)));
        const portsByRole = portTargets.reduce((acc, port) => {
            acc[String(port.role || '').toUpperCase()] = port;
            return acc;
        }, {});
        const radiusByRole = options && options.radiusByRole ? options.radiusByRole : {};

        nodes.forEach((node) => {
            const role = String(node.role || '').toUpperCase();
            const parentRole = role.includes('POD') ? 'POD' : 'POL';
            const parentPort = portsByRole[parentRole];
            const color = parentRole === 'POD' ? '#2563eb' : '#16a34a';
            const nodeColor = '#f97316';
            const radiusNm = Number(radiusByRole[parentRole] || (parentRole === 'POD' ? 100 : 300));
            const lat = Number(node.lat);
            const lon = Number(node.lon);

            if (parentPort && typeof L.polyline === 'function') {
                L.polyline([[Number(parentPort.lat), Number(parentPort.lon)], [lat, lon]], {
                    color: nodeColor,
                    weight: 1.4,
                    opacity: 0.72,
                    dashArray: '6, 8',
                    interactive: false
                }).addTo(layer);
            }

            if (typeof L.circle === 'function') {
                L.circle([lat, lon], {
                    color: nodeColor,
                    fillColor: nodeColor,
                    fillOpacity: 0.07,
                    radius: radiusNm * 1852,
                    weight: 1,
                    dashArray: '3, 7',
                    interactive: false
                }).addTo(layer);
            }

            if (typeof L.marker === 'function' && typeof L.divIcon === 'function') {
                const label = `${parentRole} nodo · ${node.region || 'Región operativa'}`;
                L.marker([lat, lon], {
                    interactive: true,
                    icon: L.divIcon({
                        className: 'operational-region-node-marker',
                        html: `<div class="operational-region-node operational-region-node-${parentRole.toLowerCase()}" style="--node-parent-color:${color};"><span></span><strong>${escapePopupText(node.name || 'Nodo')}</strong></div>`,
                        iconSize: [120, 28],
                        iconAnchor: [12, 14]
                    })
                })
                    .bindTooltip(`${escapePopupText(node.name || 'Nodo vecino')} · ${escapePopupText(label)}`, { sticky: true })
                    .addTo(layer);
            }
        });

        layer.addTo(targetMap);
        operationalRegionLayerState.layer = layer;
        operationalRegionLayerState.key = key;
        return { rendered: true, nodeCount: nodes.length };
    }

    function obtenerBoundingBoxesActuales(mapInstance) {
        const targetMap = mapInstance || (typeof window !== 'undefined' && (window.AISmap || window.aisMap || window.mapaAIS || window.map));
        if (!targetMap || typeof targetMap.getBounds !== 'function') return null;

        const bounds = targetMap.getBounds();
        if (!bounds || typeof bounds.getWest !== 'function' || typeof bounds.getSouth !== 'function' || typeof bounds.getEast !== 'function' || typeof bounds.getNorth !== 'function') {
            return null;
        }

        // 1. Extraer los ejes puros del Viewport actual del usuario
        const west = bounds.getWest();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const north = bounds.getNorth();

        // Guardar en el estado interno para los fallbacks
        setAisStreamBounds({
            latMin: south,
            latMax: north,
            lonMin: west,
            lonMax: east
        });

        // 2. RETORNAR EL FORMATO GEOJSON REQUERIDO POR AISSTREAM:
        // Un array de cajas donde cada caja contiene el punto Suroeste [Lng, Lat] y Nordeste [Lng, Lat]
        return [
            [
                [west, south], // Esquina inferior izquierda (Longitud, Latitud)
                [east, north]  // Esquina superior derecha (Longitud, Latitud)
            ]
        ];
    }

    function getAisStreamSubscriptionPayload(apiKey) {
        if (!apiKey || !aisStreamState.currentBounds) return null;
        
        // Unificamos para que use la misma estructura GeoJSON exacta de la pantalla
        return {
            "APIKey": apiKey,
            "BoundingBoxes": [
                [
                    [aisStreamState.currentBounds.latMin, aisStreamState.currentBounds.lonMin],
                    [aisStreamState.currentBounds.latMax, aisStreamState.currentBounds.lonMax]
                ]
            ],
            "VesselTypes": [70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
            "FilterMessageTypes": ["PositionReport", "ShipStaticData"]
        };
    }

    function getAisStreamApiKey(config) {
        const configuredKey = config && config.apiKey !== undefined ? config.apiKey : aisStreamState.apiKey;
        let storedKey = '';
        if (typeof window !== 'undefined') {
            storedKey = window.AISSTREAM_API_KEY || window.AISTREAM_API_KEY || '';
            try {
                storedKey = storedKey || localStorage.getItem('aisstream_api_key') || '';
            } catch (_) {}
        }
        storedKey = String(configuredKey || storedKey || '').trim();
        if (storedKey.includes('***') || storedKey.length < 10) {
            storedKey = '';
        }
        return storedKey;
    }

    async function pollAisProxyOnce(options) {
        if (typeof fetch === 'undefined' || aisProxyPollingState.inFlight) {
            return { success: false, skipped: true };
        }
        if (typeof window !== 'undefined' && !window.aisRadarUserActivated) {
            if (typeof window.setAisRadarStatus === 'function') {
                window.setAisRadarStatus('inactive');
            }
            return { success: false, skipped: true, reason: 'waiting-for-user-route-activation' };
        }
        if (typeof window !== 'undefined' && typeof window.isAisRouteReady === 'function' && !window.isAisRouteReady()) {
            if (typeof window.setAisRadarStatus === 'function') {
                window.setAisRadarStatus('inactive');
            }
            return { success: false, skipped: true, reason: 'route-inputs-missing' };
        }

        const config = Object.assign({}, options || {});
        aisProxyPollingState.inFlight = true;
        try {
            if (typeof window !== 'undefined' && typeof window.setAisRadarStatus === 'function') {
                window.setAisRadarStatus('updating');
            }
            const endpoint = config.endpoint || aisProxyPollingState.endpoint;
            const endpointUrl = new URL(endpoint, window.location.origin);
            const hasExplicitBoxes = /(?:[?&]boxes=)(?:[^&]+)/.test(endpoint);
            const isGlobalNameSearch = endpointUrl.searchParams.get('mode') === 'global' || endpointUrl.searchParams.has('vesselName') || endpointUrl.searchParams.has('q') || endpointUrl.searchParams.has('search');
            const mapInstance = aisProxyPollingState.map || config.map || getDefaultAisMap();
            const shouldUseViewportBounds = !hasExplicitBoxes && !isGlobalNameSearch;
            const bounds = shouldUseViewportBounds ? await getStableProxyBounds(mapInstance) : null;
            const proxyPayload = shouldUseViewportBounds ? getProxyBoundsPayload(bounds) : null;
            if (shouldUseViewportBounds && !proxyPayload) {
                return { success: false, skipped: true, reason: 'map-bounds-not-ready' };
            }
            const finalRequestUrl = shouldUseViewportBounds ? buildFinalProxyRequestUrl(endpoint, proxyPayload) : endpoint;
            console.log('[AIS Proxy] get-vessels payload before fetch:', {
                endpoint,
                requestUrl: finalRequestUrl,
                bounds: proxyPayload,
                mode: isGlobalNameSearch ? 'global-name' : (hasExplicitBoxes ? 'route-pol-pod' : 'bounded')
            });
            const response = await fetch(finalRequestUrl);
            const payload = await response.json().catch(() => []);
            if (!response.ok) {
                throw new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`);
            }
            const vessels = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload && payload.vessels) ? payload.vessels : []);
            emitHydrationUpdate(vessels, { source: 'server-proxy' });
            if (typeof window !== 'undefined' && typeof window.freezeAisRadarStatus === 'function') {
                window.freezeAisRadarStatus(Math.min(vessels.length || 400, 400));
            }
            return { success: true, vesselCount: vessels.length };
        } finally {
            aisProxyPollingState.inFlight = false;
        }
    }

    function startAisProxyPolling(options) {
        const config = Object.assign({}, options || {});

        clearTimeout(aisProxyPollingState.timer);
        aisProxyPollingState.endpoint = config.endpoint || aisProxyPollingState.endpoint;
        aisProxyPollingState.map = config.map || getDefaultAisMap();
        aisProxyPollingState.intervalMs = Math.max(300000, Number(config.intervalMs || aisProxyPollingState.intervalMs) || 300000);
        aisProxyPollingState.retryDelaysMs = Array.isArray(config.retryDelaysMs) && config.retryDelaysMs.length
            ? config.retryDelaysMs
            : aisProxyPollingState.retryDelaysMs;
        aisProxyPollingState.retryIndex = 0;
        aisProxyPollingState.userActivated = config.userActivated === true;
        const scheduleNextPoll = (delayMs) => {
            if (!aisProxyPollingState.userActivated) return;
            aisProxyPollingState.timer = setTimeout(runPoll, delayMs);
        };
        const runPoll = () => {
            if (!aisProxyPollingState.userActivated) {
                aisProxyPollingState.timer = null;
                return;
            }
            const liveConfig = Object.assign({}, config, {
                map: aisProxyPollingState.map || getDefaultAisMap()
            });
            pollAisProxyOnce(liveConfig)
                .then(() => {
                    aisProxyPollingState.retryIndex = 0;
                })
                .catch((err) => {
                    if (config.onError) config.onError(err);
                    const delays = aisProxyPollingState.retryDelaysMs;
                    aisProxyPollingState.retryIndex = Math.min(aisProxyPollingState.retryIndex + 1, delays.length - 1);
                })
                .finally(() => {
                    if (aisProxyPollingState.timer !== null) {
                        const retryDelay = aisProxyPollingState.retryDelaysMs[aisProxyPollingState.retryIndex] || aisProxyPollingState.intervalMs;
                        scheduleNextPoll(aisProxyPollingState.retryIndex > 0 ? retryDelay : aisProxyPollingState.intervalMs);
                    }
                });
        };
        aisProxyPollingState.timer = 0;
        runPoll();
        return { started: true, endpoint: aisProxyPollingState.endpoint, intervalMs: aisProxyPollingState.intervalMs };
    }

    function stopAisProxyPolling() {
        clearTimeout(aisProxyPollingState.timer);
        aisProxyPollingState.timer = null;
        aisProxyPollingState.userActivated = false;
        aisProxyPollingState.retryIndex = 0;
        return { stopped: true };
    }

    async function resetAisCache() {
        if (typeof fetch === 'undefined') {
            throw new Error('Fetch API is not available.');
        }
        const response = await fetch('/.netlify/functions/get-vessels?action=reset-cache', {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`);
        }
        hydrationCache.clear();
        clearTimeout(aisProxyPollingState.timer);
        aisProxyPollingState.timer = null;
        return payload;
    }

    function actualizarSuscripcionRadarAIS(mapInstance, options) {
        const targetMap = mapInstance || aisStreamState.boundMap || (typeof window !== 'undefined' && (window.AISmap || window.aisMap || window.mapaAIS || window.map));
        const config = Object.assign({}, aisStreamState.options, options || {});
        return startAisProxyPolling(Object.assign({}, config, {
            map: null,
            endpoint: config.endpoint || aisProxyPollingState.endpoint,
            intervalMs: config.intervalMs || aisProxyPollingState.intervalMs
        }));
    }

    function bindAisMapMovementSync(mapInstance, options) {
        clearTimeout(aisStreamState.mapMoveTimer);
        aisStreamState.mapMoveTimer = null;
        aisStreamState.boundMap = null;
        return { bound: false, reason: 'dual-radar-independent-of-map' };
    }

    function closeAisStreamSocket() {
        clearTimeout(aisStreamState.reconnectTimer);
        aisStreamState.reconnectTimer = null;
        if (aisStreamState.ws) {
            aisStreamState.ws.onclose = null;
            aisStreamState.ws.onerror = null;
            aisStreamState.ws.onmessage = null;
            aisStreamState.ws.onopen = null;
            aisStreamState.ws.close();
            aisStreamState.ws = null;
        }
        if (typeof window !== 'undefined' && window.aisWebSocket) {
            window.aisWebSocket = null;
        }
    }

    function startPersistentAisStream(options) {
        const config = Object.assign({}, aisStreamState.options, options || {});
        if (config.bounds) setAisStreamBounds(config.bounds);
        if (config.leafletBounds) setAisStreamBoundsFromLeafletBounds(config.leafletBounds);
        if (config.map) {
            obtenerBoundingBoxesActuales(config.map);
        }
        closeAisStreamSocket();
        aisStreamState.options = config;
        if (typeof config.onStatus === 'function') {
            config.onStatus({ type: 'disabled', reason: 'websocket-disabled-polling-only' });
        }
        const result = startAisProxyPolling(Object.assign({}, config, {
            endpoint: config.endpoint || aisProxyPollingState.endpoint,
            intervalMs: config.intervalMs || aisProxyPollingState.intervalMs
        }));
        return Object.assign({ connected: false, reason: 'websocket-disabled-polling-only' }, result);
    }

    const activeMarkers = {};

    async function autoHydrate(shipList) {
        if (typeof window !== 'undefined' && window.isAisHydrationSyncing) {
            return { success: true, skipped: true, reason: 'hydration-sync-in-progress' };
        }

        const ships = Array.isArray(shipList) ? shipList.map(normalizeShipFields) : [];
        const estimatedShips = ships.filter((ship) => {
            const key = vesselKey(ship);
            const isEstimated = !!(ship && (ship.isEstimated || ship.is_estimated));
            return key && isEstimated && !hydrationInFlight.has(key) && !hydrationCache.has(key);
        });

        if (estimatedShips.length === 0) {
            return { success: true, skipped: true, vesselCount: ships.length };
        }

        estimatedShips.forEach((ship) => hydrationInFlight.add(vesselKey(ship)));

        try {
            const response = await fetch('/api/ai-ais-filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    radarSnapshot: estimatedShips,
                    frozenAt: new Date().toISOString(),
                    searchMode: 'ais-auto-hydrate'
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) {
                throw new Error(data.error || `AI AIS filter returned HTTP ${response.status}`);
            }

            const matches = Array.isArray(data.data) ? data.data : [];
            const hydratedShips = matches.map((match) => normalizeShipFields(Object.assign({}, match.ais || {}, match.vessel || {}, match)));
            estimatedShips.forEach((ship) => hydrationCache.add(vesselKey(ship)));
            emitHydrationUpdate(ships.concat(hydratedShips), { source: 'autoHydrate', hydrated: true, response: data });
            return data;
        } catch (err) {
            console.error("Error during AIS auto hydration:", err);
            emitHydrationUpdate(ships, { source: 'autoHydrate', hydrated: false, error: err.message });
            return { success: false, error: err.message };
        } finally {
            estimatedShips.forEach((ship) => hydrationInFlight.delete(vesselKey(ship)));
        }
    }

    function escapePopupText(value) {
        return String(value || "N/A")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function buildTargetPopupHtml(vessel) {
        if (typeof window === "undefined" || !window.FleetMatchmaker || typeof window.FleetMatchmaker.buildTechnicalHtml !== "function") {
            return "";
        }
        return window.FleetMatchmaker.buildTechnicalHtml(vessel);
    }

    function setupAisMarkerPopup(marker, options) {
        const mmsi = options.mmsi || options.MMSI;
        if (!mmsi) return;

        // Store the marker by mmsi so we can retrieve it in manual registration
        activeMarkers[mmsi] = marker;

        const isEstimated = !!(options.isEstimated || options.is_estimated);
        const name = options.name || options.vessel_name || options.ShipName || "Unknown";
        const statusLabel = options.statusLabel || options.status || "N/A";
        const classCat = options.vesselClass || options.class || options.category || "Bulk Carrier";
        const dwt = options.dwt || options.DWT || "N/A";

        if (isEstimated) {
            // "When receiving a click event on a pin with incomplete data ('Estimated Position'), it doesn't attempt to display 'N/A' directly from the raw AIS response."
            // Initialize the popup content without "N/A", instead show "Hydrating..." or "Loading..."
            const initialContent = `<div class="seacharter-map-popup"><strong>${name}</strong><span>IMO: <em class="hydrate-placeholder">Hydrating...</em></span><span>MMSI: ${mmsi}</span><span>Destino: <em class="hydrate-placeholder">Hydrating...</em></span><span>Ubicación: ${statusLabel}</span><small>Estimated Position / Terrestrial Coverage Gap</small></div>`;
            marker.bindPopup(initialContent);

            // Listen to click / popupopen
            const popupOpenHandler = async function () {
                if (marker._isHydrated || marker._isHydrating) return;
                marker._isHydrating = true;

                try {
                    const response = await fetch(`/api/vessels?mmsi=${mmsi}`);
                    const resData = await response.json();

                    if (resData.success && resData.data && resData.data.length > 0) {
                        const dbVessel = resData.data[0];
                        const hydratedImo = dbVessel.imo || "N/A";
                        const hydratedDest = dbVessel.destination || "N/A";
                        const hydratedLastPort = dbVessel.lastPortOfCall || dbVessel.last_port_of_call || dbVessel.ultimo_puerto || "N/A";

                        const hydratedVessel = Object.assign({}, options, dbVessel, { imo: hydratedImo, IMO: hydratedImo, destination: hydratedDest });
                        const updatedContent = `<div class="seacharter-map-popup"><strong>${name}</strong><span>IMO: ${hydratedImo}</span><span>MMSI: ${mmsi}</span><span>Destino: ${hydratedDest}</span><span>Último puerto: ${hydratedLastPort}</span><span>Ubicación: ${statusLabel}</span>${buildTargetPopupHtml(hydratedVessel)}<small>Estimated Position / Terrestrial Coverage Gap</small></div>`;
                        marker.setPopupContent(updatedContent);
                        marker._isHydrated = true;
                    } else {
                        // "If the vessel doesn't exist in the internal database, display a 'Data not available' message but allow the user to 'Register vessel manually' with the missing data."
                        const errorContent = `<div class="seacharter-map-popup"><strong>${name}</strong><span>IMO: <b class="popup-danger">Data not available</b></span><span>MMSI: ${mmsi}</span><span>Destino: <b class="popup-danger">Data not available</b></span><span>Ubicación: ${statusLabel}</span><small>Estimated Position / Terrestrial Coverage Gap</small><button onclick="window.MapLoader.registerVesselManually('${mmsi}', '${name.replace(/'/g, "\\'")}', '${statusLabel.replace(/'/g, "\\'")}')">Register vessel manually</button></div>`;
                        marker.setPopupContent(errorContent);
                    }
                } catch (err) {
                    console.error("Error during vessel data hydration:", err);
                } finally {
                    marker._isHydrating = false;
                }
            };

            if (marker._aisPopupHydrationHandler && typeof marker.off === 'function') {
                marker.off('popupopen', marker._aisPopupHydrationHandler);
            }
            marker._aisPopupHydrationHandler = popupOpenHandler;
            marker.on('popupopen', popupOpenHandler);
        } else {
            // Live position - render normal popup
            const imo = options.imo || "N/A";
            const destination = options.destination || "N/A";
            const lastPortOfCall = options.lastPortOfCall || options.last_port_of_call || options.ultimo_puerto || "N/A";
            const normalContent = `<div class="seacharter-map-popup"><strong>${name}</strong><span>IMO: ${imo}</span><span>MMSI: ${mmsi}</span><span>Destino: ${destination}</span><span>Último puerto: ${lastPortOfCall}</span><span>Ubicación: ${statusLabel}</span>${buildTargetPopupHtml(options)}</div>`;
            marker.bindPopup(normalContent);
        }
    }

    function getAisDynamicIcon(ship, polName, podName) {
        const vessel = ship || {};
        const fleetRegistry = typeof window !== "undefined" && window.FleetManager && typeof window.FleetManager.getRegistry === "function"
            ? window.FleetManager.getRegistry()
            : [];
        if (!Array.isArray(fleetRegistry) || fleetRegistry.length === 0) {
            vessel.isTarget = false;
            vessel.fleetIntelMatch = false;
            vessel.fleetIntelRecord = null;
        }
        if (
            !vessel.isTarget &&
            Array.isArray(fleetRegistry) &&
            fleetRegistry.length > 0 &&
            typeof window !== "undefined" &&
            window.FleetManager &&
            typeof window.FleetManager.isTarget === "function"
        ) {
            const matched = window.FleetManager.isTarget(vessel);
            vessel.isTarget = matched;
            vessel.fleetIntelMatch = matched;
            if (matched && typeof window.FleetManager.getVesselData === "function") {
                vessel.fleetIntelRecord = window.FleetManager.getVesselData(vessel);
            }
        }
        const destination = String(vessel.destination || vessel.Destination || (vessel.MetaData && vessel.MetaData.Destination) || "").toUpperCase();
        const status = String(vessel.statusLabel || vessel.status || vessel.NavigationalStatusLabel || "").toUpperCase();
        const normalizedPol = polName ? String(polName).toUpperCase().trim() : "";
        const normalizedPod = podName ? String(podName).toUpperCase().trim() : "";
        const radarZone = String(vessel.aisRadarZone || (vessel.MetaData && vessel.MetaData.aisRadarZone) || "").toUpperCase();
        const radarColor = vessel.aisRadarColor || (radarZone === "NODE_POL" || radarZone === "NODE_POD" ? "#f97316" : (radarZone === "POL" ? "#16a34a" : (radarZone === "POD" ? "#2563eb" : (radarZone === "ROUTE" ? "#3b82f6" : (radarZone === "GLOBAL" ? "#64748b" : "")))));
        const isProjectionCandidate = !!(vessel.projectionCandidate || vessel.aisMarkerStyle === "ghost" || (vessel.MetaData && (vessel.MetaData.projectionCandidate || vessel.MetaData.aisMarkerStyle === "ghost")));
        const isKeyPort = !!(
            (normalizedPol && destination.includes(normalizedPol)) ||
            (normalizedPod && destination.includes(normalizedPod))
        );

        let iconClass = "fa-ship";
        let iconColor = radarColor || "#3b82f6";
        let imageIcon = "";

        if (vessel.isTarget) {
            iconClass = "fa-star";
            iconColor = "#f59e0b";
        } else if (radarZone === "NODE_POL" || radarZone === "NODE_POD") {
            iconClass = "fa-ship";
            iconColor = "#f97316";
        } else if (radarZone === "POL") {
            iconClass = "fa-ship";
            iconColor = "#16a34a";
        } else if (radarZone === "POD") {
            iconClass = "fa-ship";
            iconColor = "#2563eb";
        } else if (radarZone === "ROUTE") {
            iconClass = "fa-ship";
            iconColor = "#3b82f6";
        } else if (radarZone === "GLOBAL") {
            iconClass = "fa-ship";
            iconColor = "#64748b";
        } else if (isKeyPort) {
            iconClass = "fa-flag";
            iconColor = "#ef4444";
        } else if (
            status.includes("FONDEADO") ||
            status.includes("ANCHOR") ||
            status.includes("PUERTO") ||
            status.includes("MOORED")
        ) {
            iconClass = "fa-anchor";
            iconColor = "#10b981";
            imageIcon = MAP_STYLE_CONFIG.icons.load;
        }

        const isNeighborNode = radarZone === "NODE_POL" || radarZone === "NODE_POD";
        const iconConfig = {
            className: "custom-ais-icon",
            html: imageIcon
                ? `<div class="seacharter-ais-icon${isProjectionCandidate ? ' ghost-ship' : ''}${isNeighborNode ? ' neighbor-node' : ''}" data-icon-class="${iconClass}" style="--marker-color: ${iconColor}; color: ${iconColor};"><img src="${imageIcon}" alt="" width="24" height="24"></div>`
                : `<div class="seacharter-ais-icon${isProjectionCandidate ? ' ghost-ship' : ''}${vessel.isTarget ? ' fleet-intel-match' : ''}${isNeighborNode ? ' neighbor-node' : ''}" style="--marker-color: ${iconColor};"><i class="fa-solid fas ${iconClass}"></i></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        };

        if (typeof L !== "undefined" && L && typeof L.divIcon === "function") {
            return L.divIcon(iconConfig);
        }
        return iconConfig;
    }

    async function registerVesselManually(mmsi, name, statusLabel) {
        const marker = activeMarkers[mmsi];
        if (!marker) return;

        const imoInput = prompt(`Register Vessel "${name}" (MMSI: ${mmsi})\nEnter IMO Number:`);
        if (imoInput === null) return; // User cancelled
        const imo = imoInput.trim();

        const destInput = prompt(`Register Vessel "${name}" (MMSI: ${mmsi})\nEnter Destination:`);
        if (destInput === null) return; // User cancelled
        const destination = destInput.trim();

        try {
            const payload = {
                vessel_name: name,
                mmsi: mmsi,
                imo: imo || "Unknown",
                destination: destination || "Unknown"
            };

            const response = await fetch('/api/vessels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const resData = await response.json();
            if (resData.success) {
                const aiPayload = Object.assign({}, payload, {
                    isEstimated: true,
                    statusLabel: statusLabel
                });
                autoHydrate([aiPayload]);

                if (typeof showToast === 'function') {
                    showToast(`⚓ Vessel "${name}" registered successfully!`);
                } else if (typeof window.showToast === 'function') {
                    window.showToast(`⚓ Vessel "${name}" registered successfully!`);
                } else {
                    alert(`⚓ Vessel "${name}" registered successfully!`);
                }

                // Update popup to show newly registered details
                const registeredContent = `<b>${name}</b><br>IMO: ${imo || 'N/A'}<br>MMSI: ${mmsi}<br>Destino: ${destination || 'N/A'}<br>Ubicación: ${statusLabel}<br><span style="color: #f59e0b; font-weight: bold;">⚠️ Estimated Position / Terrestrial Coverage Gap</span>`;
                marker.setPopupContent(registeredContent);
                marker._isHydrated = true;
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

    // Expose the module
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
        renderOperationalRegionLayer,
        clearOperationalRegionLayer,
        searchNodes,
        getSearchNodesForPort,
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

        // Sandbox QA entrypoint for injecting controlled AIS traffic into the hydration pipeline.
        window.ejecutarSimulacionRadarTest = function () {
            console.log("🧪 Iniciando entorno de pruebas: Inyectando 5 buques mercantes...");
            window.simulacionRadarActiva = true;

            const buquesTest = [
                { MMSI: 247324000, ShipName: "RODAHMAR CARRIER", AIS_Live_Lat: 36.14, AIS_Live_Lon: -5.35, DWT: 35000, GT: 22000, Draft: 9.5, statusLabel: "En navegación", destination: "ALBARRACÍN", is_estimated: false },
                { MMSI: 224412000, ShipName: "TMM IBERIA TRADER", AIS_Live_Lat: 37.95, AIS_Live_Lon: 12.50, DWT: 42000, GT: 26000, Draft: 10.2, statusLabel: "En navegación", destination: "TAMPA", is_estimated: false },
                { MMSI: 311000123, ShipName: "MED BULKER I", AIS_Live_Lat: 36.50, AIS_Live_Lon: 2.50, DWT: 55000, GT: 31000, Draft: 11.8, statusLabel: "En navegación", destination: "ARGELIA", is_estimated: false },
                { MMSI: 477123400, ShipName: "ATLANTIC GYPSUM", AIS_Live_Lat: 39.50, AIS_Live_Lon: -9.50, DWT: 38000, GT: 24000, Draft: 8.9, statusLabel: "En navegación", destination: "AVEIRO", is_estimated: false },
                { MMSI: 211987600, ShipName: "CEMENT QUEEN", AIS_Live_Lat: 41.35, AIS_Live_Lon: 2.20, DWT: 12000, GT: 85000, Draft: 6.5, statusLabel: "Fondeado", destination: "BARCELONA", is_estimated: false }
            ];

            if (typeof window.MapLoader && typeof window.MapLoader.emitHydrationUpdate === 'function') {
                window.MapLoader.emitHydrationUpdate(buquesTest, { source: 'sandbox-test', hydrated: true });
                console.log("✅ Estado global de hidratación actualizado con 5 buques de prueba.");
            } else {
                console.warn("⚠️ No se ha podido acceder a MapLoader.emitHydrationUpdate.");
            }
        };
    }
})();
