(function (window, document) {
    'use strict';

    const views = new Map();
    const DEFAULT_KEY = 'main';
    const INITIAL_VIEW = Object.freeze({ lat: 12, lng: -24, altitude: 2.15 });
    const FOCUS_ALTITUDE = 1.8;
    const CAMERA_TRANSITION_MS = 700;
    const POINT_COLOR = 'rgba(0, 255, 255, 0.8)';
    const POINT_HOVER_COLOR = '#FFFFFF';
    const POINT_ALTITUDE = 0.008;
    const POINT_HOVER_ALTITUDE = 0.016;
    const POINT_HOVER_RADIUS_FACTOR = 1.45;
    const PATH_STYLE = Object.freeze({ color: '#00FFFF', width: 2, simplify: true });
    const BALLAST_PATH_COLOR = '#F59E0B';
    const EARTH_IMAGE_URL = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
    const EARTH_TOPOLOGY_URL = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
    const NESTED_KEYS = ['vesselData', 'vessel_data', 'source_payload', 'sourcePayload', 'ais', 'AIS', 'radar', 'radarData', 'radar_data', 'response', 'results', 'records', 'items', 'payload', 'data', 'vessel', 'ship', 'position', 'PositionReport', 'details', 'registry', 'staticData', 'static_data', 'metadata', 'MetaData'];

    function toFiniteNumber(...values) {
        for (const value of values) {
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
                if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) queue.push(nestedValue);
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

    function normalizeVessel(vessel, index = 0) {
        if (!vessel || typeof vessel !== 'object') return null;
        const scopes = getObjectScopes(vessel);
        const lat = toFiniteNumber(firstValue(scopes, ['lat', 'latitude', 'Latitude', 'AIS_Live_Lat', 'LAT']));
        const lng = toFiniteNumber(firstValue(scopes, ['lng', 'lon', 'long', 'longitude', 'Longitude', 'AIS_Live_Lon', 'LON', 'LONG']));
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        const rawName = firstValue(scopes, ['name', 'vesselName', 'VesselName', 'vessel_name', 'ShipName', 'shipName', 'ship_name', 'NAME']);
        const rawImo = firstValue(scopes, ['imo', 'IMO', 'imoNumber', 'imo_number', 'imo_no', 'IMO_Number']);
        const rawDwt = firstValue(scopes, ['dwt', 'DWT', 'DWT_real', 'dwt_real', 'deadweight', 'deadweightTonnage', 'deadweight_tonnage']);
        const dwt = toFiniteNumber(rawDwt);
        return {
            ...vessel,
            lat,
            lng,
            latitude: lat,
            longitude: lng,
            name: rawName ? String(rawName).trim() : 'Buque sin nombre',
            vesselName: rawName ? String(rawName).trim() : 'Buque sin nombre',
            imo: rawImo ? String(rawImo).trim() : 'N/A',
            dwt,
            sourceIndex: index
        };
    }

    function extractVesselRecords(input) {
        if (Array.isArray(input)) return input.flatMap(extractVesselRecords);
        if (!input || typeof input !== 'object') return [];
        for (const key of NESTED_KEYS) {
            if (Array.isArray(input[key])) return extractVesselRecords(input[key]);
        }
        if (normalizeVessel(input)) return [input];
        return Object.values(input).flatMap(extractVesselRecords);
    }

    function prepareVessels(input) {
        return extractVesselRecords(input).map(normalizeVessel).filter(Boolean);
    }

    function getFilteredVessels() {
        if (!window.GlobalStore || typeof window.GlobalStore.getFilteredVessels !== 'function') return [];
        return window.GlobalStore.getFilteredVessels();
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

    function formatDwt(value) {
        const dwt = toFiniteNumber(value);
        return Number.isFinite(dwt) && dwt > 0 ? `${Math.round(dwt).toLocaleString('es-ES')} DWT` : 'DWT no disponible';
    }

    function getTooltip(vessel) {
        const name = String(vessel?.name || 'Buque sin nombre').trim() || 'Buque sin nombre';
        const imo = String(vessel?.imo || '').trim();
        return `<div class="global-fleet-tooltip"><strong>${escapeHtml(name)}</strong><span>DWT · ${escapeHtml(formatDwt(vessel?.dwt))}</span><span>IMO · ${escapeHtml(imo && imo !== 'N/A' ? imo : 'IMO no disponible')}</span></div>`;
    }

    function schedulePointInteractionStyle(view) {
        if (!view?.globe || view.hoverStyleFrameId) return;
        view.hoverStyleFrameId = requestAnimationFrame(() => {
            view.hoverStyleFrameId = null;
            applyPointInteractionStyle(view);
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

    function focusVessel(vessel, key = 'density') {
        const normalized = normalizeVessel(vessel);
        return normalized ? focusCoordinates(normalized.lat, normalized.lng, key) : false;
    }

    function focusFirstVessel(view) {
        if (view.hasFocusedVessel || !view.vessels.length) return;
        view.hasFocusedVessel = true;
        focusCoordinates(view.vessels[0].lat, view.vessels[0].lng, view.key, FOCUS_ALTITUDE, CAMERA_TRANSITION_MS);
    }

    function refreshPointRadius(view) {
        if (!view?.globe) return;
        const radius = getPointRadius(getCameraAltitude(view));
        if (Math.abs(radius - view.pointRadius) < 0.0005) return;
        view.pointRadius = radius;
        applyPointInteractionStyle(view);
    }

    function applyPointInteractionStyle(view) {
        if (!view?.globe) return;
        view.globe
            .pointColor((vessel) => vessel === view.hoveredVessel ? POINT_HOVER_COLOR : POINT_COLOR)
            .pointAltitude((vessel) => vessel === view.hoveredVessel ? POINT_HOVER_ALTITUDE : POINT_ALTITUDE)
            .pointRadius((vessel) => vessel === view.hoveredVessel ? view.pointRadius * POINT_HOVER_RADIUS_FACTOR : view.pointRadius);
    }

    function updateVessels(_vessels, key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return [];
        view.hoveredVessel = null;
        view.vessels = prepareVessels(getFilteredVessels());
        view.globe.pointsData(view.vessels);
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
        saveGlobalRouteState(ports, view.routePaths, options?.ballastPortName);
        applyRoutes(view);
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
        view.controls.autoRotate = Boolean(enabled);
        view.autoRotate = Boolean(enabled);
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
            updateVessels(null, key);
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
                .pointLat('lat')
                .pointLng('lng')
                .pointColor((vessel) => vessel === view.hoveredVessel ? POINT_HOVER_COLOR : POINT_COLOR)
                .pointAltitude((vessel) => vessel === view.hoveredVessel ? POINT_HOVER_ALTITUDE : POINT_ALTITUDE)
                .pointRadius((vessel) => vessel === view.hoveredVessel ? view.pointRadius * POINT_HOVER_RADIUS_FACTOR : view.pointRadius)
                .pointLabel(getTooltip)
                .onPointHover((vessel) => {
                    if (view.hoveredVessel === vessel) return;
                    view.hoveredVessel = vessel || null;
                    schedulePointInteractionStyle(view);
                })
                .onPointClick(() => setAutoRotate(false, key))
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
        updateVessels(null, key);
        restoreGlobalRouteState(view);
        if (key === DEFAULT_KEY) window.map = view.adapter;
        if (key === 'density') window.mapaAIS = view.adapter;
        return view.adapter;
    }

    function syncAllViews() {
        views.forEach((view) => updateVessels(null, view.key));
    }

    window.addEventListener('ais:filtered-vessels-updated', syncAllViews);
    window.addEventListener('databridge:filtered-vessels-updated', syncAllViews);
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
        focusVessel,
        focusCoordinates,
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
