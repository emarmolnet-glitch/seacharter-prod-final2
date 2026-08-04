(function (window, document) {
    'use strict';

    const views = new Map();
    const DEFAULT_KEY = 'main';
    const INITIAL_VIEW = Object.freeze({ lat: 12, lng: -24, altitude: 2.15 });
    const FOCUS_ALTITUDE = 1.8;
    const CAMERA_TRANSITION_MS = 700;
    const ACTIVE_VESSEL_FOCUS_ALTITUDE = 0.72;
    const ACTIVE_VESSEL_TRANSITION_MS = 1200;
    const POINT_COLOR = 'rgba(0, 255, 255, 0.8)';
    const POINT_HOVER_COLOR = '#FFFFFF';
    const POINT_ALTITUDE = 0.008;
    const POINT_HOVER_ALTITUDE = 0.016;
    const POINT_HOVER_RADIUS_FACTOR = 1.45;
    const VESSEL_MARKER_ALTITUDE = 0.012;
    const VESSEL_MARKER_BEARING_DISTANCE_DEG = 0.42;
    const VESSEL_MARKER_COLOR = 'rgba(203, 213, 225, 0.92)';
    const VESSEL_ACTIVE_COLOR = '#2DD4BF';
    const TRANSPARENT_POINT_COLOR = 'rgba(255, 255, 255, 0.001)';
    const PATH_STYLE = Object.freeze({ color: '#00FFFF', width: 2, simplify: true });
    const BALLAST_PATH_COLOR = '#F59E0B';
    const EARTH_IMAGE_URL = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
    const EARTH_TOPOLOGY_URL = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
    const NESTED_KEYS = ['vesselData', 'vessel_data', 'source_payload', 'sourcePayload', 'ais', 'AIS', 'radar', 'radarData', 'radar_data', 'response', 'results', 'records', 'items', 'payload', 'data', 'vessel', 'ship', 'position', 'PositionReport', 'details', 'registry', 'staticData', 'static_data', 'metadata', 'MetaData'];

    function toFiniteNumber(...values) {
        for (const value of values) {
            if (value === null || value === undefined || value === '') continue;
            if (typeof value === 'number') {
                if (Number.isFinite(value)) return value;
                continue;
            }
            if (typeof value === 'string') {
                const cleaned = value.replace(',', '.').trim();
                const parsed = parseFloat(cleaned);
                if (Number.isFinite(parsed)) return parsed;
                continue;
            }
            const number = Number(value);
            if (Number.isFinite(number)) return number;
        }
        return null;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getObjectScopes(value) {
        const scopes = [];
        const queue = [value];
        const visited = new Set();
        while (queue.length) {
            const current = queue.shift();
            if (!current || typeof current !== 'object' || Array.isArray(current) || visited.has(current)) continue;
            visited.add(current);
            scopes.push(current);
            Object.values(current).forEach((nestedValue) => {
                if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
                    queue.push(nestedValue);
                    return;
                }
                if (typeof nestedValue !== 'string' || !nestedValue.trim().startsWith('{')) return;
                try {
                    const parsedValue = JSON.parse(nestedValue);
                    if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) queue.push(parsedValue);
                } catch (_) {}
            });
        }
        return scopes;
    }

    function firstValue(scopes, keys) {
        for (const scope of scopes) {
            for (const key of keys) {
                if (scope[key] !== undefined && scope[key] !== null && scope[key] !== '') return scope[key];
            }
        }
        return null;
    }

    function firstFiniteNumber(scopes, keys) {
        for (const scope of scopes) {
            if (!scope || typeof scope !== 'object') continue;
            for (const key of keys) {
                if (scope[key] !== undefined && scope[key] !== null && scope[key] !== '') {
                    const number = toFiniteNumber(scope[key]);
                    if (Number.isFinite(number)) return number;
                }
            }
        }
        return null;
    }

    function findValidAisDirection(scopes, keys, unavailableValue) {
        for (const scope of scopes) {
            if (!scope || typeof scope !== 'object') continue;
            for (const key of keys) {
                const direction = toFiniteNumber(scope[key]);
                if (!Number.isFinite(direction) || direction === unavailableValue) continue;
                if (direction >= 0 && direction < 360) return direction;
            }
        }
        return null;
    }

    function resolveVesselHeading(scopes) {
        const course = findValidAisDirection(scopes, ['courseOverGround', 'CourseOverGround', 'cogDegrees', 'Cog', 'COG', 'cog', 'course', 'Course'], 360);
        if (course !== null) return { value: course, source: 'COG' };
        const heading = findValidAisDirection(scopes, ['trueHeading', 'TrueHeading', 'HDG', 'hdg', 'heading', 'Heading'], 511);
        return heading !== null ? { value: heading, source: 'HDG' } : { value: null, source: null };
    }

    function normalizeVessel(vessel, index = 0) {
        if (!vessel || typeof vessel !== 'object') return null;
        const scopes = getObjectScopes(vessel);
        const lat = firstFiniteNumber(scopes, ['lat', 'latitude', 'Latitude', 'AIS_Live_Lat', 'LAT', 'latitud']);
        const lng = firstFiniteNumber(scopes, ['lng', 'lon', 'long', 'longitude', 'Longitude', 'AIS_Live_Lon', 'LON', 'LONG', 'longitud']);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return null;
        const rawName = firstValue(scopes, ['name', 'vesselName', 'VesselName', 'vessel_name', 'ShipName', 'shipName', 'ship_name', 'NAME']);
        const rawImo = firstValue(scopes, ['imo', 'IMO', 'imoNumber', 'imo_number', 'imo_no', 'IMO_Number']);
        const rawMmsi = firstValue(scopes, ['mmsi', 'MMSI', 'mmsiNumber', 'mmsi_number']);
        const rawDwt = firstValue(scopes, ['dwt', 'DWT', 'DWT_real', 'dwt_real', 'deadweight', 'deadweightTonnage', 'deadweight_tonnage']);
        const dwt = toFiniteNumber(rawDwt);
        const navigation = resolveVesselHeading(scopes);
        return {
            ...vessel,
            lat,
            lng,
            latitude: lat,
            longitude: lng,
            name: rawName ? String(rawName).trim() : 'Buque sin nombre',
            vesselName: rawName ? String(rawName).trim() : 'Buque sin nombre',
            imo: rawImo ? String(rawImo).trim() : 'N/A',
            mmsi: rawMmsi ? String(rawMmsi).trim() : '',
            dwt,
            heading: navigation.value,
            headingSource: navigation.source,
            hasHeading: navigation.value !== null,
            sourceIndex: index
        };
    }

    function extractVesselRecords(input) {
        if (Array.isArray(input)) return input.flatMap(extractVesselRecords);
        if (!input || typeof input !== 'object') return [];
        if (normalizeVessel(input)) return [input];
        for (const key of NESTED_KEYS) {
            if (Array.isArray(input[key])) return extractVesselRecords(input[key]);
        }
        return Object.values(input).flatMap(extractVesselRecords);
    }

    function prepareVessels(input) {
        return extractVesselRecords(input).map(normalizeVessel).filter(Boolean);
    }

    function getFilteredVessels() {
        if (!window.GlobalStore) return [];
        if (typeof window.GlobalStore.getFilteredVessels === 'function' && window.GlobalStore.filteredVesselsInitialized) {
            const filtered = window.GlobalStore.getFilteredVessels();
            if (Array.isArray(filtered) && filtered.length > 0) return filtered;
        }
        if (typeof window.getDerivedFilteredAisVessels === 'function') {
            const derived = window.getDerivedFilteredAisVessels();
            if (Array.isArray(derived) && derived.length > 0) return derived;
        }
        if (Array.isArray(window.GlobalStore.nearbyVessels) && window.GlobalStore.nearbyVessels.length > 0) {
            return window.GlobalStore.nearbyVessels;
        }
        if (typeof window.GlobalStore.getRawVessels === 'function') {
            const raw = window.GlobalStore.getRawVessels();
            if (Array.isArray(raw) && raw.length > 0) return raw;
        }
        return window.GlobalStore.rawVessels || window.GlobalStore.vessels || [];
    }

    function getView(key = DEFAULT_KEY) {
        return views.get(key) || null;
    }

    function getContainerSize(container) {
        const bounds = container?.getBoundingClientRect?.() || {};
        return {
            width: Math.max(0, Math.round(bounds.width || container?.clientWidth || 0)),
            height: Math.max(0, Math.round(bounds.height || container?.clientHeight || 0))
        };
    }

    function getCameraAltitude(view) {
        const pointOfView = view?.globe?.pointOfView?.();
        return toFiniteNumber(pointOfView?.altitude, INITIAL_VIEW.altitude) || INITIAL_VIEW.altitude;
    }

    function getPointRadius(cameraAltitude) {
        if (cameraAltitude <= 0.45) return 0.075;
        if (cameraAltitude >= 2.40) return 0.032;
        const progress = (cameraAltitude - 0.45) / (2.40 - 0.45);
        return 0.075 + (0.032 - 0.075) * progress;
    }

    const DATABRIDGE_POINT_COLOR = '#00D2FF';
    const RADAR_LIVE_POINT_COLOR = '#10B981';

    function getVesselPointColor(vessel, hoveredVessel, selectedVessel) {
        if (vessel === selectedVessel) return '#2DD4BF';
        if (vessel === hoveredVessel) return POINT_HOVER_COLOR;
        const source = String(vessel?.data_source || vessel?.data_source_type || vessel?.source || '').toLowerCase();
        if (source === 'databridge' || source === 'cartera' || source === 'en_cartera') {
            return DATABRIDGE_POINT_COLOR;
        }
        if (source === 'radar_live' || source === 'radar' || source === 'live') {
            return RADAR_LIVE_POINT_COLOR;
        }
        return POINT_COLOR;
    }

    function formatDwt(value) {
        const dwt = toFiniteNumber(value);
        return Number.isFinite(dwt) && dwt > 0 ? `${Math.round(dwt).toLocaleString('es-ES')} DWT` : 'DWT no disponible';
    }

    function getTooltip(vessel) {
        const name = String(vessel?.name || vessel?.vesselName || 'Buque sin nombre').trim() || 'Buque sin nombre';
        const imo = String(vessel?.imo || '').trim();
        const source = String(vessel?.data_source || vessel?.data_source_type || vessel?.source || '').toLowerCase();
        const isDataBridge = source === 'databridge' || source === 'cartera' || source === 'en_cartera';
        const isRadarLive = source === 'radar_live' || source === 'radar' || source === 'live';
        const sourceLabel = isDataBridge
            ? '🏷️ En Cartera (Data Bridge)'
            : isRadarLive
            ? '📡 Descubrimiento en Vivo (Radar)'
            : '';
        const sourceBadge = sourceLabel
            ? `<span class="fleet-source-badge" style="display:block;margin-top:3px;font-size:10px;font-weight:800;color:${isDataBridge ? '#38bdf8' : '#34d399'};">${escapeHtml(sourceLabel)}</span>`
            : '';
        return `<div class="global-fleet-tooltip"><strong>${escapeHtml(name)}</strong>${sourceBadge}<span>DWT · ${escapeHtml(formatDwt(vessel?.dwt))}</span><span>IMO · ${escapeHtml(imo && imo !== 'N/A' ? imo : 'IMO no disponible')}</span></div>`;
    }

    function schedulePointInteractionStyle(view) {
        if (!view?.globe || view.hoverStyleFrameId) return;
        view.hoverStyleFrameId = requestAnimationFrame(() => {
            view.hoverStyleFrameId = null;
            applyPointInteractionStyle(view);
        });
    }

    function destinationPoint(lat, lng, bearing, angularDistanceDeg = VESSEL_MARKER_BEARING_DISTANCE_DEG) {
        const latitude = toRadians(lat);
        const longitude = toRadians(lng);
        const direction = toRadians(bearing);
        const distance = toRadians(angularDistanceDeg);
        const destinationLatitude = Math.asin(
            Math.sin(latitude) * Math.cos(distance)
            + Math.cos(latitude) * Math.sin(distance) * Math.cos(direction)
        );
        const destinationLongitude = longitude + Math.atan2(
            Math.sin(direction) * Math.sin(distance) * Math.cos(latitude),
            Math.cos(distance) - Math.sin(latitude) * Math.sin(destinationLatitude)
        );
        return { lat: toDegrees(destinationLatitude), lng: toDegrees(destinationLongitude) };
    }

    function getVesselMarkerScale(view) {
        const altitude = getCameraAltitude(view);
        if (altitude <= 0.55) return 1.08;
        if (altitude >= 2.35) return 0.62;
        return 1.08 - ((altitude - 0.55) / 1.8) * 0.46;
    }

    function createVesselMarkerElement(vessel, view) {
        const marker = document.createElement('div');
        marker.className = 'global-vessel-marker';
        marker.classList.add(vessel.hasHeading ? 'has-reported-heading' : 'is-heading-unknown');
        marker.dataset.headingSource = vessel.headingSource || 'unavailable';
        marker.setAttribute('aria-hidden', 'true');
        marker.innerHTML = vessel.hasHeading ? `
            <span class="global-vessel-marker__glyph">
                <span class="global-vessel-marker__radar-cone" aria-hidden="true"></span>
                <svg viewBox="0 0 24 52" focusable="false" aria-hidden="true">
                    <path class="global-vessel-marker__hull" d="M12 1 20 10v31l-4 10H8L4 41V10L12 1Z"/>
                    <path class="global-vessel-marker__hold" d="M7 14h10v9H7zm0 11h10v9H7z"/>
                    <path class="global-vessel-marker__deck" d="M8 37h8v8H8z"/>
                </svg>
            </span>` : `
            <span class="global-vessel-marker__glyph">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <circle class="global-vessel-marker__unknown-ring" cx="12" cy="12" r="8.5"/>
                    <circle class="global-vessel-marker__unknown-core" cx="12" cy="12" r="3"/>
                </svg>
            </span>`;
        marker.style.setProperty('--vessel-marker-color', VESSEL_MARKER_COLOR);
        marker.style.setProperty('--vessel-active-color', VESSEL_ACTIVE_COLOR);
        marker.style.setProperty('--vessel-marker-scale', String(getVesselMarkerScale(view)));
        view.vesselElements.set(vessel, marker);
        return marker;
    }

    function updateVesselMarkerOrientations(view) {
        if (!view?.globe || view.vesselElements.size === 0) return;
        const scale = getVesselMarkerScale(view);
        view.vesselElements.forEach((marker, vessel) => {
            marker.style.setProperty('--vessel-marker-scale', String(scale));
            if (!Number.isFinite(vessel.heading)) {
                marker.style.removeProperty('--vessel-screen-heading');
                return;
            }
            const origin = view.globe.getScreenCoords?.(vessel.lat, vessel.lng, VESSEL_MARKER_ALTITUDE);
            const destination = destinationPoint(vessel.lat, vessel.lng, vessel.heading);
            const projectedHeading = view.globe.getScreenCoords?.(destination.lat, destination.lng, VESSEL_MARKER_ALTITUDE);
            if (!origin || !projectedHeading) return;
            const deltaX = Number(projectedHeading.x) - Number(origin.x);
            const deltaY = Number(projectedHeading.y) - Number(origin.y);
            if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01)) return;
            marker.style.setProperty('--vessel-screen-heading', `${Math.atan2(deltaY, deltaX) * 180 / Math.PI + 90}deg`);
        });
    }

    function scheduleVesselMarkerOrientations(view) {
        if (!view?.globe || view.vesselOrientationFrameId) return;
        view.vesselOrientationFrameId = requestAnimationFrame(() => {
            view.vesselOrientationFrameId = null;
            updateVesselMarkerOrientations(view);
        });
    }

    function normalizeRoutePoint(point) {
        const lat = toFiniteNumber(point?.lat, point?.latitude, point?.Latitude, Array.isArray(point) ? point[0] : null);
        const lng = toFiniteNumber(point?.lng, point?.lon, point?.longitude, point?.Longitude, Array.isArray(point) ? point[1] : null);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { lat, lng };
    }

    function toRadians(value) {
        return value * Math.PI / 180;
    }

    function toDegrees(value) {
        return value * 180 / Math.PI;
    }

    function interpolateGreatCircle(origin, destination, steps = 128) {
        const start = normalizeRoutePoint(origin);
        const end = normalizeRoutePoint(destination);
        if (!start || !end) return [];
        const startLat = toRadians(start.lat);
        const startLng = toRadians(start.lng);
        const endLat = toRadians(end.lat);
        const endLng = toRadians(end.lng);
        const angularDistance = 2 * Math.asin(Math.sqrt(
            Math.sin((endLat - startLat) / 2) ** 2
            + Math.cos(startLat) * Math.cos(endLat) * Math.sin((endLng - startLng) / 2) ** 2
        ));
        if (!Number.isFinite(angularDistance) || angularDistance < 0.000001) return [start, end];
        const denominator = Math.sin(angularDistance);
        return Array.from({ length: steps + 1 }, (_, index) => {
            const fraction = index / steps;
            const startWeight = Math.sin((1 - fraction) * angularDistance) / denominator;
            const endWeight = Math.sin(fraction * angularDistance) / denominator;
            const x = startWeight * Math.cos(startLat) * Math.cos(startLng) + endWeight * Math.cos(endLat) * Math.cos(endLng);
            const y = startWeight * Math.cos(startLat) * Math.sin(startLng) + endWeight * Math.cos(endLat) * Math.sin(endLng);
            const z = startWeight * Math.sin(startLat) + endWeight * Math.sin(endLat);
            return { lat: toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))), lng: toDegrees(Math.atan2(y, x)) };
        });
    }

    function prepareRoutePoints(route, origin, destination) {
        const supplied = (Array.isArray(route?.coordinates) ? route.coordinates : Array.isArray(route) ? route : [])
            .map(normalizeRoutePoint)
            .filter(Boolean);
        return supplied.length > 2 ? supplied : interpolateGreatCircle(origin, destination);
    }

    function simplifyMaritimePath(points) {
        if (!PATH_STYLE.simplify || points.length <= 720) return points;
        const stride = Math.ceil(points.length / 720);
        const simplified = points.filter((_, index) => index % stride === 0);
        if (simplified[simplified.length - 1] !== points[points.length - 1]) simplified.push(points[points.length - 1]);
        return simplified;
    }

    function createPortLabel(role, port, explicitName = '') {
        const coordinates = normalizeRoutePoint(port);
        if (!coordinates) return null;
        const rawName = String(explicitName || port?.name || port?.portName || '').trim();
        if (role === 'LASTRE' && (!rawName || rawName.toUpperCase().includes('TBA') || (coordinates.lat === 0 && coordinates.lng === 0))) return null;
        const name = rawName || (role === 'POL' ? 'ORIGEN' : 'DESTINO');
        return { ...coordinates, role, text: role + ' · ' + name };
    }

    function applyRoutes(view) {
        const renderableRoutePaths = view.routePaths.filter((coordinates) => {
            if (coordinates?.routeType !== 'ballast') return true;
            const ballastPortName = String(coordinates?.ballastPortName || '').trim().toUpperCase();
            const origin = coordinates?.[0];
            const originLatitude = Number(Array.isArray(origin) ? origin[0] : origin?.lat);
            const originLongitude = Number(Array.isArray(origin) ? origin[1] : origin?.lng);
            const originIsZero = origin === 0 || (originLatitude === 0 && originLongitude === 0);
            return Boolean(ballastPortName) && !ballastPortName.includes('TBA') && !originIsZero;
        });
        view.globe
            .arcsData([])
            .pathPoints((coordinates) => coordinates)
            .pathPointLat('lat')
            .pathPointLng('lng')
            .pathPointAlt(() => 0.012)
            .pathColor((coordinates) => coordinates?.routeType === 'ballast' ? BALLAST_PATH_COLOR : PATH_STYLE.color)
            .pathStroke(() => PATH_STYLE.width)
            .pathTransitionDuration(0)
            .pathsData(renderableRoutePaths)
            .labelsData(view.portLabels);
    }

    function saveGlobalRouteState(ports, routePaths, ballastPortName = '') {
        if (!window.GlobalStore || !routePaths.length) return;
        window.GlobalStore.globeRouteState = {
            ports: { ballast: ports?.ballast || null, pol: ports?.pol || null, pod: ports?.pod || null },
            ballastPortName: String(ballastPortName || ports?.ballast?.name || '').trim(),
            routeTypes: routePaths.map((coordinates) => coordinates.routeType || 'laden'),
            paths: routePaths.map((coordinates) => coordinates.map((point) => ({ ...point })))
        };
    }

    function restoreGlobalRouteState(view) {
        const state = window.GlobalStore?.globeRouteState;
        const storedPaths = Array.isArray(state?.paths)
            ? state.paths.map((path) => Array.isArray(path) ? path.map(normalizeRoutePoint).filter(Boolean) : []).filter((path) => path.length > 1)
            : [];
        if (!storedPaths.length) return;
        storedPaths.forEach((path, index) => {
            path.routeType = state.routeTypes?.[index] || 'laden';
            if (path.routeType === 'ballast') path.ballastPortName = String(state?.ballastPortName || state?.ports?.ballast?.name || '').trim();
        });
        view.routePaths = storedPaths;
        view.portLabels = [createPortLabel('LASTRE', state?.ports?.ballast, state?.ballastPortName), createPortLabel('POL', state?.ports?.pol), createPortLabel('POD', state?.ports?.pod)].filter(Boolean);
        applyRoutes(view);
    }

    function focusCoordinates(lat, lng, key = 'density', altitude = FOCUS_ALTITUDE, duration = CAMERA_TRANSITION_MS) {
        const view = getView(key) || getView(DEFAULT_KEY);
        const normalized = normalizeRoutePoint({ lat, lng });
        if (!view || !normalized) return false;
        view.globe.pointOfView({ ...normalized, altitude }, duration);
        return true;
    }

    function findMatchingVessel(vessels, normalized) {
        if (!normalized) return null;
        const normalizedImo = String(normalized.imo || '').replace(/\D/g, '');
        const normalizedMmsi = String(normalized.mmsi || '').replace(/\D/g, '');
        const normalizedName = String(normalized.vesselName || '').trim().toLowerCase();
        return vessels.find(candidate => {
            const candidateImo = String(candidate.imo || '').replace(/\D/g, '');
            const candidateMmsi = String(candidate.mmsi || '').replace(/\D/g, '');
            const candidateName = String(candidate.vesselName || '').trim().toLowerCase();
            return (normalizedImo && normalizedImo === candidateImo)
                || (normalizedMmsi && normalizedMmsi === candidateMmsi)
                || (normalizedName && normalizedName === candidateName)
                || (Math.abs(candidate.lat - normalized.lat) < 0.0001 && Math.abs(candidate.lng - normalized.lng) < 0.0001);
        }) || null;
    }

    function getVesselIdentity(vessel) {
        if (!vessel) return null;
        const imo = String(vessel.imo || '').replace(/\D/g, '');
        const mmsi = String(vessel.mmsi || '').replace(/\D/g, '');
        return imo || mmsi ? { imo, mmsi } : null;
    }

    function setSelectedVessel(view, vessel) {
        view.selectedVessel = vessel || null;
        view.selectedVesselIdentity = getVesselIdentity(vessel);
    }

    function selectVessel(vessel, key = 'density') {
        const normalized = normalizeVessel(vessel);
        const view = getView(key) || getView(DEFAULT_KEY);
        if (!normalized || !view) return false;
        view.selectedVessel = findMatchingVessel(view.vessels, normalized);
        view.selectedVesselIdentity = getVesselIdentity(normalized);
        applyPointInteractionStyle(view);
        return Boolean(view.selectedVessel);
    }

    function focusVessel(vessel, key = 'density') {
        const normalized = normalizeVessel(vessel);
        const view = getView(key) || getView(DEFAULT_KEY);
        if (!normalized || !view) return false;
        selectVessel(normalized, key);
        return focusCoordinates(normalized.lat, normalized.lng, key);
    }

    function focusActiveVessel(vessel, key = 'density') {
        const normalized = normalizeVessel(vessel);
        const view = getView(key) || getView(DEFAULT_KEY);
        if (!normalized || !view) return false;
        selectVessel(normalized, view.key);
        setAutoRotate(false, view.key);
        view.globe.pointOfView({
            lat: normalized.lat,
            lng: normalized.lng,
            altitude: 1.2
        }, 1500);
        return true;
    }

    function getScreenCoordinates(lat, lng, key = 'density', altitude = POINT_ALTITUDE) {
        const view = getView(key) || getView(DEFAULT_KEY);
        const normalized = normalizeRoutePoint({ lat, lng });
        if (!view || !normalized || typeof view.globe?.getScreenCoords !== 'function') return null;
        const coordinates = view.globe.getScreenCoords(normalized.lat, normalized.lng, altitude);
        return Number.isFinite(Number(coordinates?.x)) && Number.isFinite(Number(coordinates?.y))
            ? { x: Number(coordinates.x), y: Number(coordinates.y) }
            : null;
    }

    function focusFirstVessel(view) {
        if (view.hasFocusedVessel || !view.vessels.length) return;
        view.hasFocusedVessel = true;
        focusCoordinates(view.vessels[0].lat, view.vessels[0].lng, view.key, FOCUS_ALTITUDE, CAMERA_TRANSITION_MS);
    }

    function refreshPointRadius(view) {
        if (!view?.globe) return;
        scheduleVesselMarkerOrientations(view);
        const radius = getPointRadius(getCameraAltitude(view));
        if (Math.abs(radius - view.pointRadius) < 0.0005) return;
        view.pointRadius = radius;
        applyPointInteractionStyle(view);
    }

    function applyPointInteractionStyle(view) {
        if (!view?.globe) return;
        view.globe
            .pointColor(() => TRANSPARENT_POINT_COLOR)
            .pointAltitude((vessel) => vessel === view.hoveredVessel || vessel === view.selectedVessel ? POINT_HOVER_ALTITUDE : POINT_ALTITUDE)
            .pointRadius((vessel) => vessel === view.hoveredVessel || vessel === view.selectedVessel ? view.pointRadius * POINT_HOVER_RADIUS_FACTOR : view.pointRadius);
        view.vesselElements.forEach((marker, vessel) => {
            marker.classList.toggle('is-hovered', vessel === view.hoveredVessel);
            marker.classList.toggle('is-selected', vessel === view.selectedVessel);
        });
    }

    function updateVessels(_vessels, key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return [];
        view.hoveredVessel = null;
        const selectedVessel = view.selectedVesselIdentity || view.selectedVessel;
        if (_vessels !== null && _vessels !== undefined) {
            view.vessels = prepareVessels(_vessels);
        } else {
            const densityVessels = key === 'density' && typeof window.getDensityMapSourceVessels === 'function'
                ? window.getDensityMapSourceVessels()
                : null;
            view.vessels = prepareVessels(Array.isArray(densityVessels) ? densityVessels : getFilteredVessels());
        }
        view.selectedVessel = findMatchingVessel(view.vessels, selectedVessel);
        try {
            if (view.globe && typeof view.globe.pointsData === 'function') {
                view.globe.pointsData(view.vessels);
            }
            if (view.globe && typeof view.globe.htmlElementsData === 'function') {
                view.vesselElements.clear();
                view.globe.htmlElementsData(view.vessels);
                scheduleVesselMarkerOrientations(view);
            }
        } catch (error) {
            console.error('[GlobalFleetGlobe] Error al renderizar marcadores de buques en el globo:', error);
        }
        applyPointInteractionStyle(view);
        refreshPointRadius(view);
        focusFirstVessel(view);
        return view.vessels;
    }

    function fitRoute(view) {
        const points = view.routePaths.flat();
        if (!points.length) return;
        const center = points[Math.floor(points.length / 2)];
        const latSpan = Math.max(...points.map((point) => point.lat)) - Math.min(...points.map((point) => point.lat));
        const altitude = Math.min(2.4, Math.max(1.1, 1.15 + latSpan / 75));
        view.globe.pointOfView({ lat: center.lat, lng: center.lng, altitude }, CAMERA_TRANSITION_MS);
    }

    function setRouteSegments(ports, key = DEFAULT_KEY, options = {}, routes = {}) {
        const view = getView(key);
        if (!view) return [];
        const ballast = normalizeRoutePoint(ports?.ballast);
        const pol = normalizeRoutePoint(ports?.pol);
        const pod = normalizeRoutePoint(ports?.pod);
        const ballastPath = ballast && pol ? simplifyMaritimePath(prepareRoutePoints(routes?.ballast, ballast, pol)) : [];
        const maritimePath = pol && pod ? simplifyMaritimePath(prepareRoutePoints(routes?.laden, pol, pod)) : [];
        if (ballastPath.length > 1) {
            ballastPath.routeType = 'ballast';
            ballastPath.ballastPortName = String(options?.ballastPortName || ports?.ballast?.name || '').trim();
        }
        if (maritimePath.length > 1) maritimePath.routeType = 'laden';
        view.routePaths = [ballastPath, maritimePath].filter((path) => path.length > 1);
        view.portLabels = [createPortLabel('LASTRE', ports?.ballast, options?.ballastPortName), createPortLabel('POL', ports?.pol), createPortLabel('POD', ports?.pod)].filter(Boolean);
        if (options?.persist !== false) saveGlobalRouteState(ports, view.routePaths, options?.ballastPortName);
        applyRoutes(view);
        if (view.routePaths.length) setAutoRotate(false, key);
        if (view.routePaths.length && options.focus !== false) fitRoute(view);
        return view.routePaths;
    }

    function setRoute(pol, pod, key = DEFAULT_KEY, options = {}) {
        return setRouteSegments({ pol, pod }, key, options);
    }

    function setRouteResult(result, key = DEFAULT_KEY, options = {}) {
        const ballastPort = typeof result?.portBallast === 'string' ? result.portBallast.trim() : '';
        const hasBallastPort = ballastPort !== '' && ballastPort !== 'TBA';
        const coordinates = hasBallastPort
            ? (result?.coordinates || {})
            : { ...(result?.coordinates || {}), ballast: null };
        const routes = hasBallastPort
            ? (result?.routes || {})
            : { ...(result?.routes || {}), ballast: null };
        return setRouteSegments(coordinates, key, { ...options, ballastPortName: ballastPort }, routes);
    }

    function resize(key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return;
        const size = getContainerSize(view.container);
        if (size.width <= 1 || size.height <= 1) return;
        view.globe.width(size.width).height(size.height);
        scheduleVesselMarkerOrientations(view);
    }

    function updateAutoRotateControl(view) {
        const button = view?.rotationButton;
        if (!button) return;
        const isActive = Boolean(view.autoRotate);
        button.dataset.state = isActive ? 'playing' : 'paused';
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
        button.setAttribute('aria-label', isActive ? 'Pausar rotación automática' : 'Reanudar rotación automática');
        button.title = isActive ? 'Pausar rotación' : 'Reanudar rotación';
    }

    function createAutoRotateControl(view) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'global-fleet-rotation-toggle';
        button.innerHTML = '<span class="global-fleet-rotation-toggle__icon" aria-hidden="true"><svg class="global-fleet-rotation-toggle__pause" viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg><svg class="global-fleet-rotation-toggle__play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span><span class="global-fleet-rotation-toggle__text">Rotación</span>';
        view.handleRotationToggle = (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleAutoRotate(view.key);
        };
        view.handleRotationControlPointerDown = (event) => event.stopPropagation();
        button.addEventListener('click', view.handleRotationToggle);
        button.addEventListener('pointerdown', view.handleRotationControlPointerDown);
        view.rotationButton = button;
        view.container.appendChild(button);
        updateAutoRotateControl(view);
    }

    function resetCamera(key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return false;
        view.globe.pointOfView(INITIAL_VIEW, CAMERA_TRANSITION_MS);
        setAutoRotate(true, key);
        return true;
    }

    function setAutoRotate(enabled, key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return false;
        const shouldRotate = Boolean(enabled);
        view.autoRotate = shouldRotate;
        view.controls.autoRotate = shouldRotate;
        view.controls.update?.();
        updateAutoRotateControl(view);
        return view.autoRotate;
    }

    function toggleAutoRotate(key = DEFAULT_KEY) {
        const view = getView(key);
        return view ? setAutoRotate(!view.autoRotate, key) : false;
    }

    function zoomToAltitude(zoom) {
        return Math.max(0.35, Math.min(2.4, 3.1 - (Number(zoom) || 4) * 0.22));
    }

    function createAdapter(view) {
        return {
            seaCharterEngine: 'globe-gl-2.46.1',
            resize: () => resize(view.key),
            invalidateSize: () => resize(view.key),
            getZoom: () => getCameraAltitude(view),
            setView: (coordinates, zoom) => {
                const lat = Array.isArray(coordinates) ? coordinates[0] : coordinates?.lat;
                const lng = Array.isArray(coordinates) ? coordinates[1] : (coordinates?.lng ?? coordinates?.lon);
                focusCoordinates(lat, lng, view.key, zoomToAltitude(zoom));
                return view.adapter;
            },
            flyTo: (coordinates, zoom) => view.adapter.setView(coordinates, zoom),
            loaded: () => true,
            remove: () => destroy(view.key),
            removeLayer: () => view.adapter,
            eachLayer: () => view.adapter
        };
    }

    function destroy(key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return;
        view.resizeObserver?.disconnect();
        if (view.hoverStyleFrameId) cancelAnimationFrame(view.hoverStyleFrameId);
        if (view.vesselOrientationFrameId) cancelAnimationFrame(view.vesselOrientationFrameId);
        view.controls?.removeEventListener?.('change', view.handleControlsChange);
        view.controls?.removeEventListener?.('start', view.handleInteractionStart);
        view.container.removeEventListener?.('pointerdown', view.handleContainerPointerDown);
        view.rotationButton?.removeEventListener?.('click', view.handleRotationToggle);
        view.rotationButton?.removeEventListener?.('pointerdown', view.handleRotationControlPointerDown);
        view.globe?._destructor?.();
        view.container.replaceChildren();
        views.delete(key);
        if (key === DEFAULT_KEY) window.map = null;
        if (key === 'density') window.mapaAIS = null;
    }

    function ensureContainerDimensions(container) {
        container.classList.add('global-fleet-globe');
        container.style.display = 'block';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.minHeight = container.style.minHeight || '280px';
        container.style.position = container.style.position || 'relative';
        container.style.zIndex = container.style.zIndex === '-1' ? '0' : container.style.zIndex;
    }

    function mount(options = {}) {
        const key = options.key || DEFAULT_KEY;
        const containerId = options.containerId || (key === 'density' ? 'ais-map' : 'map-container');
        const container = document.getElementById(containerId);
        if (!container) return null;
        ensureContainerDimensions(container);
        const size = getContainerSize(container);
        window.globalFleetGlobeDiagnostics = {
            key,
            containerId,
            globeLoaded: typeof window.Globe === 'function',
            width: size.width,
            height: size.height,
            mapboxTokenRequired: false,
            checkedAt: Date.now()
        };
        if (typeof window.Globe !== 'function') {
            console.error('[GlobalFleetGlobe] globe.gl 2.46.1 no está disponible.', window.globalFleetGlobeDiagnostics);
            return null;
        }
        if (size.width <= 1 || size.height <= 1) {
            container.dataset.renderKey = 'loading';
            requestAnimationFrame(() => mount(options));
            return null;
        }
        const existing = getView(key);
        if (existing && existing.container === container) {
            updateVessels(options.vesselsData ?? null, key);
            resize(key);
            return existing.adapter;
        }
        if (existing) destroy(key);
        container.dataset.renderKey = 'mounted';
        container.replaceChildren();
        const view = {
            key,
            container,
            globe: null,
            controls: null,
            adapter: null,
            vessels: [],
            routePaths: [],
            portLabels: [],
            pointRadius: getPointRadius(INITIAL_VIEW.altitude),
            hoveredVessel: null,
            selectedVessel: null,
            selectedVesselIdentity: null,
            vesselElements: new Map(),
            vesselOrientationFrameId: null,
            hoverStyleFrameId: null,
            autoRotate: options.autoRotate !== false,
            hasFocusedVessel: false,
            resizeObserver: null,
            rotationButton: null,
            handleControlsChange: null,
            handleInteractionStart: null,
            handleContainerPointerDown: null,
            handleRotationToggle: null,
            handleRotationControlPointerDown: null
        };
        views.set(key, view);
        try {
            view.globe = window.Globe({ animateIn: false, waitForGlobeReady: true })(container)
                .width(size.width)
                .height(size.height)
                .backgroundColor('rgba(0, 0, 0, 0)')
                .globeImageUrl(EARTH_IMAGE_URL)
                .bumpImageUrl(EARTH_TOPOLOGY_URL)
                .atmosphereColor('#39D7E8')
                .atmosphereAltitude(0.16)
                .htmlLat('lat')
                .htmlLng('lng')
                .htmlAltitude(() => VESSEL_MARKER_ALTITUDE)
                .htmlElement((vessel) => createVesselMarkerElement(vessel, view))
                .htmlElementVisibilityModifier((element, isVisible) => {
                    element.classList.toggle('is-globe-visible', Boolean(isVisible));
                })
                .htmlTransitionDuration(0)
                .htmlElementsData([])
                .pointLat('lat')
                .pointLng('lng')
                .pointColor(() => TRANSPARENT_POINT_COLOR)
                .pointAltitude((vessel) => vessel === view.hoveredVessel || vessel === view.selectedVessel ? POINT_HOVER_ALTITUDE : POINT_ALTITUDE)
                .pointRadius((vessel) => vessel === view.hoveredVessel || vessel === view.selectedVessel ? view.pointRadius * POINT_HOVER_RADIUS_FACTOR : view.pointRadius)
                .pointLabel(getTooltip)
                .onPointHover((vessel) => {
                    if (view.hoveredVessel === vessel) return;
                    view.hoveredVessel = vessel || null;
                    schedulePointInteractionStyle(view);
                })
                .onPointClick((vessel) => {
                    setSelectedVessel(view, vessel);
                    setAutoRotate(false, key);
                    applyPointInteractionStyle(view);
                    if (typeof window.selectShip === 'function') {
                        window.selectShip(
                            vessel.vesselName,
                            vessel.mmsi,
                            vessel.lat,
                            vessel.lng,
                            vessel.imo,
                            vessel.destination
                        );
                    }
                })
                .pointsTransitionDuration(0)
                .arcsData([])
                .pathPoints((coordinates) => coordinates)
                .pathPointLat('lat')
                .pathPointLng('lng')
                .pathPointAlt(() => 0.012)
                .pathColor((coordinates) => coordinates?.routeType === 'ballast' ? BALLAST_PATH_COLOR : PATH_STYLE.color)
                .pathStroke(() => PATH_STYLE.width)
                .pathTransitionDuration(0)
                .pathsData([])
                .labelLat('lat')
                .labelLng('lng')
                .labelText('text')
                .labelColor(() => '#FFFFFF')
                .labelSize(() => 1.05)
                .labelDotRadius(() => 0.32)
                .labelAltitude(() => 0.018)
                .labelsData([]);
            view.globe.pointOfView(INITIAL_VIEW, 0);
            view.controls = view.globe.controls();
            view.controls.enableDamping = true;
            view.controls.dampingFactor = 0.08;
            view.controls.autoRotate = view.autoRotate;
            view.controls.autoRotateSpeed = 0.45;
            view.handleControlsChange = () => refreshPointRadius(view);
            view.handleInteractionStart = () => setAutoRotate(false, key);
            view.handleContainerPointerDown = (event) => {
                if (event.target?.closest?.('.global-fleet-rotation-toggle')) return;
                setAutoRotate(false, key);
            };
            view.controls.addEventListener?.('change', view.handleControlsChange);
            view.controls.addEventListener?.('start', view.handleInteractionStart);
            view.container.addEventListener('pointerdown', view.handleContainerPointerDown);
            createAutoRotateControl(view);
        } catch (error) {
            views.delete(key);
            window.globalFleetGlobeLastError = { message: error?.message || String(error), key, occurredAt: Date.now() };
            console.error('[GlobalFleetGlobe] Error crítico durante el montaje.', error);
            return null;
        }
        view.adapter = createAdapter(view);
        if (typeof ResizeObserver !== 'undefined') {
            view.resizeObserver = new ResizeObserver(() => resize(key));
            view.resizeObserver.observe(container);
            if (container.parentElement) view.resizeObserver.observe(container.parentElement);
        }
        updateVessels(options.vesselsData ?? null, key);
        if (options.restoreRouteState !== false) restoreGlobalRouteState(view);
        if (key === DEFAULT_KEY) window.map = view.adapter;
        if (key === 'density') window.mapaAIS = view.adapter;
        return view.adapter;
    }

    function syncAllViews() {
        views.forEach((view) => updateVessels(null, view.key));
    }

    window.addEventListener('ais:filtered-vessels-updated', syncAllViews);
    window.addEventListener('databridge:filtered-vessels-updated', syncAllViews);
    let activeVesselFocusTimer = null;
    function focusActiveVesselWhenReady(vessel, key = 'density', attempt = 0) {
        if (focusActiveVessel(vessel, key)) {
            activeVesselFocusTimer = null;
            return true;
        }
        if (attempt >= 5) {
            activeVesselFocusTimer = null;
            return false;
        }
        if (activeVesselFocusTimer) window.clearTimeout(activeVesselFocusTimer);
        activeVesselFocusTimer = window.setTimeout(() => {
            focusActiveVesselWhenReady(vessel, key, attempt + 1);
        }, 300);
        return false;
    }
    window.addEventListener('vessel-selection:changed', (event) => {
        const activeVessel = event?.detail?.activeVessel
            || window.GlobalStore?.activeVessel
            || window.activeVessel;
        focusActiveVesselWhenReady(activeVessel, 'density');
    });
    window.getGlobalFleetGlobeDiagnostics = () => ({
        diagnostics: window.globalFleetGlobeDiagnostics || null,
        lastError: window.globalFleetGlobeLastError || null
    });

    const globalFleetGlobe = Object.freeze({
        mount,
        destroy,
        resize,
        updateVessels,
        setRoute,
        setRouteSegments,
        setRouteResult,
        selectVessel,
        focusVessel,
        focusActiveVessel,
        focusCoordinates,
        getScreenCoordinates,
        resetCamera,
        setAutoRotate,
        toggleAutoRotate,
        getInstance: (key = DEFAULT_KEY) => getView(key)?.adapter || null,
        getVessels: (key = DEFAULT_KEY) => getView(key)?.vessels || [],
        pointProps: Object.freeze({ color: POINT_COLOR, hoverColor: POINT_HOVER_COLOR, altitude: POINT_ALTITUDE, nearRadius: 0.075, farRadius: 0.032 })
    });

    window.GlobalFleetGlobe = globalFleetGlobe;
    window.GlobeMapView = globalFleetGlobe;
})(window, document);
