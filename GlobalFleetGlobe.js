(function (window, document) {
    'use strict';

    const views = new Map();
    const pendingMountFrames = new Map();
    const activeVesselFocusTimers = new Map();
    const DEFAULT_KEY = 'main';
    const INITIAL_VIEW = Object.freeze({ lat: 24, lng: -24, altitude: 2.5 });
    const FOCUS_ALTITUDE = 1.8;
    const CAMERA_TRANSITION_MS = 700;
    const ACTIVE_VESSEL_FOCUS_ALTITUDE = 0.72;
    const ACTIVE_VESSEL_TRANSITION_MS = 1200;
    const TRACKING_VESSEL_FOCUS_ALTITUDE = 0.42;
    const TRACKING_VESSEL_TRANSITION_MS = 1100;
    const PORT_DETAIL_ENTER_ALTITUDE = 0.58;
    const PORT_DETAIL_EXIT_ALTITUDE = 0.72;
    const PORT_TILE_ENGINE_MAX_LEVEL = 18;
    const COMMERCIAL_VESSEL_COLOR = '#10B981';
    const TANKER_VESSEL_COLOR = '#F59E0B';
    const NOISE_VESSEL_COLOR = '#EF4444';
    const POINT_HOVER_COLOR = '#FFFFFF';
    const SURFACE_ALTITUDE = 0;
    const VESSEL_VECTOR_RADIUS = 0.72;
    const VESSEL_VECTOR_LENGTH = 2.6;
    const VESSEL_VECTOR_SEGMENTS = 24;
    const VESSEL_VECTOR_FLAT_SCALE = 0.16;
    const VESSEL_VECTOR_SURFACE_OFFSET = 0.08;
    const PATH_STYLE = Object.freeze({ color: '#00FFFF', width: 2, simplify: true });
    const BALLAST_PATH_COLOR = '#F59E0B';
    const EARTH_IMAGE_URL = '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
    const EARTH_TOPOLOGY_URL = '//unpkg.com/three-globe/example/img/earth-topology.png';
    const GLOBE_FALLBACK_COLOR = '#1a202c';
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

    function normalizeInitialView(value) {
        const lat = toFiniteNumber(value?.lat, INITIAL_VIEW.lat);
        const lng = toFiniteNumber(value?.lng, value?.lon, INITIAL_VIEW.lng);
        const altitude = toFiniteNumber(value?.altitude, INITIAL_VIEW.altitude);
        return {
            lat: Math.max(-90, Math.min(90, lat ?? INITIAL_VIEW.lat)),
            lng: Math.max(-180, Math.min(180, lng ?? INITIAL_VIEW.lng)),
            altitude: Math.max(0.15, altitude ?? INITIAL_VIEW.altitude),
        };
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

    function normalizeVesselIdentifier(value, length) {
        const text = String(value ?? '').trim();
        if (!text || /^(?:PENDING|PENDING_IMO|N\/A|NA|UNKNOWN|UNDEFINED|NULL|-+)$/i.test(text)) return '';
        const digits = text.replace(/\D/g, '');
        return digits.length === length ? digits : '';
    }

    const COORDINATE_KEY_PAIRS = Object.freeze([
        ['AIS_Live_Lat', 'AIS_Live_Lon'],
        ['originalLatitude', 'originalLongitude'],
        ['latitude', 'longitude'],
        ['Latitude', 'Longitude'],
        ['lat', 'lng'],
        ['lat', 'lon'],
        ['lat', 'long'],
        ['LAT', 'LON'],
        ['LAT', 'LONG'],
        ['Port_Registro_Lat', 'Port_Registro_Lon'],
        ['latitud', 'longitud']
    ]);

    function readCoordinatePair(scope) {
        if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
        for (const [latKey, lngKey] of COORDINATE_KEY_PAIRS) {
            let lat = toFiniteNumber(scope[latKey]);
            let lng = toFiniteNumber(scope[lngKey]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            let axisOrder = 'lat-lng';
            if (Math.abs(lat) > 90 && Math.abs(lat) <= 180 && Math.abs(lng) <= 90) {
                [lat, lng] = [lng, lat];
                axisOrder = 'lng-lat-corrected';
            }
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
            if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) continue;
            return { lat, lng, axisOrder, source: `${latKey}/${lngKey}` };
        }
        return null;
    }

    function resolveVesselCoordinates(vessel) {
        const sourcePayload = vessel?.source_payload || vessel?.sourcePayload;
        const message = vessel?.Message;
        const sourceMessage = sourcePayload?.Message;
        const scopes = [
            vessel,
            vessel?.ais,
            vessel?.AIS,
            vessel?.PositionReport,
            vessel?.position,
            message?.PositionReport,
            message?.StandardClassBPositionReport,
            message?.ExtendedClassBPositionReport,
            vessel?.MetaData,
            vessel?.metadata,
            sourcePayload,
            sourcePayload?.ais,
            sourcePayload?.PositionReport,
            sourcePayload?.position,
            sourceMessage?.PositionReport,
            sourceMessage?.StandardClassBPositionReport,
            sourceMessage?.ExtendedClassBPositionReport,
            sourcePayload?.MetaData,
            sourcePayload?.metadata
        ];
        const visited = new Set();
        for (const scope of scopes) {
            if (!scope || typeof scope !== 'object' || visited.has(scope)) continue;
            visited.add(scope);
            const coordinates = readCoordinatePair(scope);
            if (coordinates) return coordinates;
        }
        return null;
    }

    function getVesselColor(vesselType) {
        const normalizedType = String(vesselType || '').trim().toLowerCase();
        if (normalizedType.includes('general cargo') || normalizedType.includes('bulk carrier')) {
            return COMMERCIAL_VESSEL_COLOR;
        }
        if (normalizedType.includes('tanker') || /\b(liquid|gas|oil|chemical|lng|lpg)\b/.test(normalizedType)) {
            return TANKER_VESSEL_COLOR;
        }
        return NOISE_VESSEL_COLOR;
    }

    function isInboundToPolVessel(vessel) {
        const scopes = getObjectScopes(vessel);
        const matchReason = String(firstValue(scopes, ['matchReason', 'match_reason', 'searchVector', 'search_vector', 'aisRadarZone']) || '').toUpperCase();
        return matchReason === 'INBOUND_TO_POL'
            || matchReason === 'DESTINATION_GLOBAL'
            || matchReason === 'LONG_DISTANCE_POL'
            || scopes.some(scope => scope.inboundToPol === true
                || scope.predictiveMatch === true
                || scope.longDistanceTransitToPol === true);
    }

    function getVesselDisplayColor(vessel) {
        return isInboundToPolVessel(vessel) ? INBOUND_TO_POL_COLOR : getVesselColor(vessel?.vesselType);
    }

    function normalizeVessel(vessel, index = 0) {
        if (!vessel || typeof vessel !== 'object') return null;
        const scopes = getObjectScopes(vessel);
        const coordinates = resolveVesselCoordinates(vessel);
        if (!coordinates) return null;
        const { lat, lng } = coordinates;
        const rawName = firstValue(scopes, ['name', 'vesselName', 'VesselName', 'vessel_name', 'ShipName', 'shipName', 'ship_name', 'NAME']);
        const rawImo = firstValue(scopes, ['imo', 'IMO', 'imoNumber', 'imo_number', 'imo_no', 'IMO_Number']);
        const rawMmsi = firstValue(scopes, ['mmsi', 'MMSI', 'mmsiNumber', 'mmsi_number']);
        const rawDwt = firstValue(scopes, ['dwt', 'DWT', 'DWT_real', 'dwt_real', 'deadweight', 'deadweightTonnage', 'deadweight_tonnage']);
        const rawVesselType = firstValue(scopes, ['vesselType', 'vessel_type', 'shipType', 'ship_type', 'ShipType', 'type', 'category', 'vesselClass', 'specialtyType']);
        const dwt = toFiniteNumber(rawDwt);
        const navigation = resolveVesselHeading(scopes);
        return {
            ...vessel,
            lat,
            lng,
            latitude: lat,
            longitude: lng,
            baseLat: lat,
            baseLng: lng,
            originalLatitude: lat,
            originalLongitude: lng,
            name: rawName ? String(rawName).trim() : 'Buque sin nombre',
            vesselName: rawName ? String(rawName).trim() : 'Buque sin nombre',
            imo: normalizeVesselIdentifier(rawImo, 7) || 'N/A',
            mmsi: normalizeVesselIdentifier(rawMmsi, 9),
            dwt,
            vesselType: rawVesselType ? String(rawVesselType).trim() : 'Other',
            heading: navigation.value,
            course: navigation.source === 'COG' ? navigation.value : null,
            headingSource: navigation.source,
            hasHeading: navigation.value !== null,
            inboundToPol: isInboundToPolVessel(vessel),
            coordinateAxisOrder: coordinates.axisOrder,
            coordinateSource: coordinates.source,
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

    function isRenderableVesselPoint(vessel) {
        return vessel
            && Number.isFinite(vessel.lat)
            && Number.isFinite(vessel.lng)
            && vessel.lat >= -90
            && vessel.lat <= 90
            && vessel.lng >= -180
            && vessel.lng <= 180;
    }

    function prepareVessels(input, cameraAltitude = INITIAL_VIEW.altitude) {
        if (!Array.isArray(input) && (!input || typeof input !== 'object')) return [];
        try {
            const vessels = extractVesselRecords(input)
                .map(normalizeVessel)
                .filter(isRenderableVesselPoint);
            return vessels;
        } catch (error) {
            console.warn('[GlobalFleetGlobe] Payload AIS descartado por formato inválido.', error);
            return [];
        }
    }

    function getFilteredVessels() {
        if (!window.GlobalStore) return [];
        const centralRadarVessels = getCentralRadarVessels();
        if (centralRadarVessels !== null) return centralRadarVessels;
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

    function createFallbackGlobeMaterial() {
        const THREE = window.THREE;
        if (!THREE || typeof THREE.MeshPhongMaterial !== 'function') return null;
        return new THREE.MeshPhongMaterial({
            color: GLOBE_FALLBACK_COLOR,
            shininess: 6,
            specular: '#123447'
        });
    }

    function getCameraAltitude(view) {
        const pointOfView = view?.globe?.pointOfView?.();
        return toFiniteNumber(pointOfView?.altitude, view?.initialView?.altitude, INITIAL_VIEW.altitude) || INITIAL_VIEW.altitude;
    }

    function getPortTileUrl(x, y, z) {
        return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    }

    function setPortDetailActive(view, active) {
        const nextActive = Boolean(active);
        if (!view?.globe || typeof view.globe.globeTileEngineUrl !== 'function' || view.portDetailActive === nextActive) return;
        view.portDetailActive = nextActive;
        view.globe.globeTileEngineUrl(nextActive ? getPortTileUrl : null);
    }

    function configurePortTileEngine(view) {
        const globe = view?.globe;
        const supportsTileUrl = typeof globe?.globeTileEngineUrl === 'function';
        const supportsMaxLevel = typeof globe?.globeTileEngineMaxLevel === 'function';
        window.globalFleetGlobeDiagnostics = {
            ...(window.globalFleetGlobeDiagnostics || {}),
            supportsTileUrl,
            supportsMaxLevel,
        };
        if (!supportsTileUrl) {
            console.warn('[GlobalFleetGlobe] globeTileEngineUrl no está disponible en el runtime cargado.');
            return false;
        }
        if (supportsMaxLevel) globe.globeTileEngineMaxLevel(PORT_TILE_ENGINE_MAX_LEVEL);
        else console.warn('[GlobalFleetGlobe] globeTileEngineMaxLevel no está disponible; se usa el límite nativo.');
        globe.globeTileEngineUrl(null);
        return true;
    }

    function updatePortDetailForAltitude(view, altitude) {
        const normalizedAltitude = toFiniteNumber(altitude);
        if (!Number.isFinite(normalizedAltitude)) return;
        if (!view.portDetailActive && normalizedAltitude <= PORT_DETAIL_ENTER_ALTITUDE) {
            setPortDetailActive(view, true);
        } else if (view.portDetailActive && normalizedAltitude > PORT_DETAIL_EXIT_ALTITUDE) {
            setPortDetailActive(view, false);
        }
    }

    function handleGlobeZoom(view, pointOfView) {
        const altitude = toFiniteNumber(pointOfView?.altitude);
        updatePortDetailForAltitude(view, altitude);
        const detailActive = Boolean(view?.portDetailActive);
        console.log('Altitud:', altitude, 'Modo LOD:', detailActive);
    }

    function getCentralRadarVessels() {
        if (!window.GlobalStore) return null;
        if (Array.isArray(window.GlobalStore.matchingVessels)
            && window.GlobalStore.matchingVessels.length > 0) {
            return window.GlobalStore.matchingVessels;
        }
        if (window.GlobalStore.radarSnapshotStatus === 'empty' && window.GlobalStore.radarSnapshotAt) return [];
        return null;
    }

    function getGlobePointLabel(vessel) {
        const name = String(vessel?.name || vessel?.vesselName || 'Buque sin nombre').trim() || 'Buque sin nombre';
        const imo = String(vessel?.imo || '').trim();
        return imo && imo !== 'N/A' ? `${name} · IMO ${imo}` : name;
    }

    function escapeTooltipText(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function resolvePolCoordinates(view) {
        const portLabel = Array.isArray(view?.portLabels)
            ? view.portLabels.find(label => label?.role === 'POL')
            : null;
        const routeStatePol = window.GlobalStore?.globeRouteState?.ports?.pol;
        const matchingRequestPol = window.GlobalStore?.matchingRequest?.polCoordinates
            || window.GlobalStore?.matchingRequest?.pol_coordinates
            || window.matchingRequest?.polCoordinates
            || window.matchingRequest?.pol_coordinates;
        const candidates = [
            portLabel,
            window.GlobalStore?.polCoordinates,
            window.GlobalStore?.pol_coordinates,
            matchingRequestPol,
            routeStatePol
        ];
        for (const candidate of candidates) {
            const coordinates = normalizeRoutePoint(candidate);
            if (coordinates) return coordinates;
        }
        return null;
    }

    function haversineDistanceNm(origin, destination) {
        const start = normalizeRoutePoint(origin);
        const end = normalizeRoutePoint(destination);
        if (!start || !end) return null;
        const earthRadiusNm = 3440.065;
        const deltaLat = toRadians(end.lat - start.lat);
        const deltaLng = toRadians(end.lng - start.lng);
        const startLat = toRadians(start.lat);
        const endLat = toRadians(end.lat);
        const haversine = Math.sin(deltaLat / 2) ** 2
            + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
        return earthRadiusNm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
    }

    function getVesselTacticalMetrics(view, vessel) {
        const scopes = getObjectScopes(vessel);
        const polCoordinates = resolvePolCoordinates(view);
        const explicitDistance = toFiniteNumber(firstValue(scopes, [
            'currentDistanceToLoadPort', 'distanceToPol', 'distanceToPOL', 'distance_to_pol_nm',
            'distance_to_pol', 'distanceNmToPol', 'distance_nm_to_pol'
        ]));
        const distanceNm = Number.isFinite(explicitDistance)
            ? explicitDistance
            : haversineDistanceNm(vessel, polCoordinates);
        const explicitEtaDays = toFiniteNumber(firstValue(scopes, [
            'etaToPolDays', 'estimatedDaysToPol', 'daysToPol', 'eta_days', 'transitDaysToPol'
        ]));
        const explicitEtaHours = toFiniteNumber(firstValue(scopes, [
            'etaToPolHours', 'estimatedHoursToPol', 'hoursToPol', 'eta_hours'
        ]));
        const speedKnots = toFiniteNumber(firstValue(scopes, [
            'speed', 'sog', 'SOG', 'speedOverGround', 'speed_over_ground', 'SpeedOverGround'
        ]));
        let etaDays = Number.isFinite(explicitEtaDays) ? explicitEtaDays : null;
        if (!Number.isFinite(etaDays) && Number.isFinite(explicitEtaHours)) etaDays = explicitEtaHours / 24;
        if (!Number.isFinite(etaDays) && Number.isFinite(distanceNm) && Number.isFinite(speedKnots) && speedKnots > 0.5) {
            etaDays = distanceNm / speedKnots / 24;
        }
        return { polCoordinates, distanceNm, etaDays, speedKnots };
    }

    function formatEtaDays(etaDays) {
        if (!Number.isFinite(etaDays) || etaDays < 0) return 'N/D';
        if (etaDays < 1) return `${Math.max(1, Math.round(etaDays * 24))} h`;
        return `${etaDays.toFixed(etaDays < 10 ? 1 : 0)} d`;
    }

    function getVesselTacticalLabel(view, vessel) {
        const metrics = getVesselTacticalMetrics(view, vessel);
        const name = escapeTooltipText(vessel?.name || vessel?.vesselName || 'Buque sin nombre');
        const distance = Number.isFinite(metrics.distanceNm)
            ? `${Math.round(metrics.distanceNm).toLocaleString('en-US')} NM`
            : 'N/D';
        const heading = Number.isFinite(vessel?.heading)
            ? `${Math.round(vessel.heading)}° ${escapeTooltipText(vessel.headingSource || '')}`.trim()
            : 'N/D';
        const imo = String(vessel?.imo || '').trim();
        const dwt = Number(vessel?.dwt);
        const registry = [
            imo && imo !== 'N/A' ? `IMO ${escapeTooltipText(imo)}` : '',
            Number.isFinite(dwt) && dwt > 0 ? `DWT ${Math.round(dwt).toLocaleString('en-US')}` : ''
        ].filter(Boolean).join(' · ');
        return `<div class="global-fleet-tooltip global-fleet-tooltip--tactical"><strong>${name}</strong>${registry ? `<span>${registry}</span>` : ''}<span>Distancia al POL · ${distance}</span><span>ETA al POL · ${formatEtaDays(metrics.etaDays)}</span><span>Rumbo · ${heading}</span></div>`;
    }

    function createVesselThreeObject(view, vessel) {
        const THREE = window.THREE;
        if (!hasCompatibleThreeNamespace()) return null;
        try {
            const geometry = new THREE.ConeGeometry(VESSEL_VECTOR_RADIUS, VESSEL_VECTOR_LENGTH, VESSEL_VECTOR_SEGMENTS);
            const material = new THREE.MeshStandardMaterial({
                color: COMMERCIAL_VESSEL_COLOR,
                emissive: COMMERCIAL_VESSEL_COLOR,
                emissiveIntensity: 0.34,
                roughness: 0.38,
                metalness: 0.08,
                transparent: true,
                opacity: 0.96,
                depthWrite: true
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.scale.set(1, 1, VESSEL_VECTOR_FLAT_SCALE);
            const group = new THREE.Group();
            group.add(mesh);
            group.userData.vessel = vessel;
            updateVesselThreeObject(view, group, vessel);
            return group;
        } catch (error) {
            console.warn('[GlobalFleetGlobe] No se pudo crear el cono direccional.', error);
            return new THREE.Group();
        }
    }

    function updateVesselThreeObject(view, object, vessel) {
        const THREE = window.THREE;
        if (!object || !hasCompatibleThreeNamespace() || typeof view?.globe?.getCoords !== 'function') return object;
        try {
        const centerCoordinates = view.globe.getCoords(vessel.lat, vessel.lng, SURFACE_ALTITUDE);
        const northLatitude = vessel.lat >= 89.95 ? vessel.lat - 0.05 : vessel.lat + 0.05;
        const eastLongitude = vessel.lng >= 179.95 ? vessel.lng - 0.05 : vessel.lng + 0.05;
        const northCoordinates = view.globe.getCoords(northLatitude, vessel.lng, SURFACE_ALTITUDE);
        const eastCoordinates = view.globe.getCoords(vessel.lat, eastLongitude, SURFACE_ALTITUDE);
        const center = new THREE.Vector3(centerCoordinates.x, centerCoordinates.y, centerCoordinates.z);
        const normal = center.clone().normalize();
        const north = new THREE.Vector3(northCoordinates.x, northCoordinates.y, northCoordinates.z)
            .sub(center)
            .projectOnPlane(normal)
            .normalize();
        const east = new THREE.Vector3(eastCoordinates.x, eastCoordinates.y, eastCoordinates.z)
            .sub(center)
            .projectOnPlane(normal)
            .normalize();
        const headingRadians = toRadians(Number.isFinite(vessel.heading) ? vessel.heading : 0);
        const direction = north.multiplyScalar(Math.cos(headingRadians))
            .add(east.multiplyScalar(Math.sin(headingRadians)))
            .normalize();
        const side = direction.clone().cross(normal).normalize();
        const rotationBasis = new THREE.Matrix4().makeBasis(side, direction, normal);
        object.position.copy(center).addScaledVector(normal, VESSEL_VECTOR_SURFACE_OFFSET);
        object.quaternion.setFromRotationMatrix(rotationBasis);
        object.userData.vessel = vessel;
        return object;
        } catch (error) {
            if (window.globalFleetVectorUpdateWarningShown !== true) {
                window.globalFleetVectorUpdateWarningShown = true;
                console.warn('[GlobalFleetGlobe] Se omitió una actualización de rumbo incompatible.', error);
            }
            return object;
        }
    }

    function buildVesselPolArcs(view) {
        const polCoordinates = resolvePolCoordinates(view);
        if (!polCoordinates) return [];
        return (Array.isArray(view?.vessels) ? view.vessels : []).map(vessel => {
            const metrics = getVesselTacticalMetrics(view, vessel);
            return {
                vessel,
                startLat: vessel.lat,
                startLng: vessel.lng,
                endLat: polCoordinates.lat,
                endLng: polCoordinates.lng,
                color: 'rgba(16, 185, 129, 0.38)',
                distanceNm: metrics.distanceNm,
                etaDays: metrics.etaDays
            };
        });
    }

    function applyVesselPolArcs(view) {
        if (!view?.globe || typeof view.globe.arcsData !== 'function') return;
        view.globe.arcsData(typeof buildVesselPolArcs === 'function' ? buildVesselPolArcs(view) : []);
    }

    function handleVesselClick(view, vessel) {
        if (!vessel) return;
        setSelectedVessel(view, vessel);
        setAutoRotate(false, view.key);
        if (typeof window.selectShip === 'function') {
            window.selectShip(
                vessel.vesselName,
                vessel.mmsi,
                vessel.originalLatitude ?? vessel.baseLat ?? vessel.lat,
                vessel.originalLongitude ?? vessel.baseLng ?? vessel.lng,
                vessel.imo,
                vessel.destination
            );
        }
    }

    function safeVesselTacticalLabel(view, vessel) {
        try {
            return getVesselTacticalLabel(view, vessel);
        } catch (error) {
            if (window.globalFleetTooltipWarningShown !== true) {
                window.globalFleetTooltipWarningShown = true;
                console.warn('[GlobalFleetGlobe] Tooltip táctico degradado a texto seguro.', error);
            }
            return escapeTooltipText(vessel?.name || vessel?.vesselName || 'Buque sin nombre');
        }
    }

    function hasCompatibleThreeNamespace() {
        const THREE = window.THREE;
        return Boolean(THREE
            && typeof THREE.ConeGeometry === 'function'
            && typeof THREE.MeshStandardMaterial === 'function'
            && typeof THREE.Mesh === 'function'
            && typeof THREE.Group === 'function'
            && typeof THREE.Vector3 === 'function'
            && typeof THREE.Matrix4 === 'function');
    }

    function configureVesselPointFallback(view, reason = 'three-unavailable') {
        if (!view?.globe) return false;
        view.renderMode = 'points';
        view.vectorFallbackReason = reason;
        view.globe.customLayerData?.([]);
        view.globe
            .pointResolution(32)
            .pointsMerge(false)
            .pointLat('lat')
            .pointLng('lng')
            .pointColor(() => COMMERCIAL_VESSEL_COLOR)
            .pointAltitude(SURFACE_ALTITUDE)
            .pointRadius(0.15)
            .pointLabel((vessel) => safeVesselTacticalLabel(view, vessel))
            .onPointHover((vessel) => {
                view.hoveredVessel = vessel || null;
                view.container.style.cursor = vessel ? 'pointer' : 'grab';
            })
            .onPointClick((vessel) => handleVesselClick(view, vessel))
            .pointsTransitionDuration(0)
            .pointsData([]);
        return true;
    }

    function configureVesselVectorLayer(view) {
        if (!view?.globe || !hasCompatibleThreeNamespace()) return false;
        try {
            view.renderMode = 'vectors';
            view.vectorFallbackReason = null;
            view.globe.pointsData?.([]);
            view.globe
                .customThreeObject((vessel) => createVesselThreeObject(view, vessel))
                .customThreeObjectUpdate((object, vessel) => updateVesselThreeObject(view, object, vessel))
                .customLayerLabel((vessel) => safeVesselTacticalLabel(view, vessel))
                .onCustomLayerHover((vessel) => {
                    view.hoveredVessel = vessel || null;
                    view.container.style.cursor = vessel ? 'pointer' : 'grab';
                })
                .onCustomLayerClick((vessel) => handleVesselClick(view, vessel))
                .customLayerData([]);
            return true;
        } catch (error) {
            console.warn('[GlobalFleetGlobe] Capa Three.js no compatible; se activa el fallback WebGL.', error);
            view.renderMode = 'points';
            view.vectorFallbackReason = 'three-layer-configuration-error';
            return false;
        }
    }

    function renderVesselLayer(view, vessels) {
        if (!view?.globe) return 'unmounted';
        if (view.renderMode === 'vectors') {
            try {
                view.globe.customLayerData(vessels);
                return 'vectors';
            } catch (error) {
                console.warn('[GlobalFleetGlobe] Error en geometría direccional; se conserva el globo con puntos nativos.', error);
                configureVesselPointFallback(view, 'three-render-error');
            }
        }
        view.globe.pointsData(vessels);
        return 'points';
    }

    function getTacticalLabels(view) {
        return Array.isArray(view?.portLabels) ? view.portLabels : [];
    }

    function applyTacticalLabels(view) {
        if (!view?.globe) return;
        view.globe.labelsData(getTacticalLabels(view));
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
        return {
            ...coordinates,
            type: 'port',
            role,
            text: (role === 'LASTRE' && /^POS\s*-\s*/i.test(name)) || (role === 'POL' && /^POL\s*-\s*/i.test(name))
                ? name
                : role + ' · ' + name,
            rotation: 0,
            altitude: 0.018,
            size: 1.05,
            dotRadius: 0.32
        };
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
            .arcsData(typeof buildVesselPolArcs === 'function' ? buildVesselPolArcs(view) : [])
            .pathPoints((coordinates) => coordinates)
            .pathPointLat('lat')
            .pathPointLng('lng')
            .pathPointAlt(() => 0.012)
            .pathColor((coordinates) => coordinates?.routeType === 'ballast' ? BALLAST_PATH_COLOR : PATH_STYLE.color)
            .pathStroke(() => PATH_STYLE.width)
            .pathTransitionDuration(0)
            .pathsData(renderableRoutePaths)
            .labelsData(getTacticalLabels(view));
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
        applyTacticalLabels(view);
        return Boolean(view.selectedVessel);
    }

    function focusVessel(vessel, key = 'density') {
        const normalized = normalizeVessel(vessel);
        const view = getView(key) || getView(DEFAULT_KEY);
        if (!normalized || !view) return false;
        selectVessel(normalized, key);
        return focusCoordinates(normalized.originalLatitude, normalized.originalLongitude, key);
    }

    function focusActiveVessel(vessel, key = 'density') {
        const normalized = normalizeVessel(vessel);
        const view = getView(key) || getView(DEFAULT_KEY);
        if (!normalized || !view) return false;
        selectVessel(normalized, view.key);
        setAutoRotate(false, view.key);
        if (view.key === 'tracking') {
            view.globe.pointOfView({
                lat: normalized.originalLatitude,
                lng: normalized.originalLongitude,
                altitude: TRACKING_VESSEL_FOCUS_ALTITUDE
            }, TRACKING_VESSEL_TRANSITION_MS);
            return true;
        }
        view.globe.pointOfView({
            lat: normalized.originalLatitude,
            lng: normalized.originalLongitude,
            altitude: 1.2
        }, 1500);
        return true;
    }

    function getScreenCoordinates(lat, lng, key = 'density', altitude = SURFACE_ALTITUDE) {
        const view = getView(key) || getView(DEFAULT_KEY);
        const normalized = normalizeRoutePoint({ lat, lng });
        if (!view || !normalized || typeof view.globe?.getScreenCoords !== 'function') return null;
        const coordinates = view.globe.getScreenCoords(normalized.lat, normalized.lng, altitude);
        return Number.isFinite(Number(coordinates?.x)) && Number.isFinite(Number(coordinates?.y))
            ? { x: Number(coordinates.x), y: Number(coordinates.y) }
            : null;
    }

    function focusFirstVessel(view) {
        if (!view.focusFirstVesselEnabled || view.hasFocusedVessel || !view.vessels.length) return;
        view.hasFocusedVessel = true;
        focusCoordinates(view.vessels[0].lat, view.vessels[0].lng, view.key, FOCUS_ALTITUDE, CAMERA_TRANSITION_MS);
    }

    function updateVessels(_vessels, key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return [];
        const previousVessels = Array.isArray(view.vessels) ? view.vessels.slice() : [];
        view.hoveredVessel = null;
        const selectedVessel = view.selectedVesselIdentity || view.selectedVessel;
        const hasExplicitVessels = _vessels !== null && _vessels !== undefined;
        const centralRadarVessels = getCentralRadarVessels();
        const requestedVessels = hasExplicitVessels ? _vessels : getFilteredVessels();
        view.vessels = prepareVessels(
            !hasExplicitVessels && Array.isArray(centralRadarVessels) ? centralRadarVessels : requestedVessels,
            getCameraAltitude(view)
        );
        view.selectedVessel = findMatchingVessel(view.vessels, selectedVessel);
        try {
            view.lastVesselRenderMode = renderVesselLayer(view, view.vessels);
            applyVesselPolArcs(view);
            applyTacticalLabels(view);
        } catch (error) {
            console.error('[GlobalFleetGlobe] Error al renderizar marcadores de buques; se conserva el último snapshot válido:', error);
            view.vessels = previousVessels;
            try {
                view.lastVesselRenderMode = renderVesselLayer(view, previousVessels);
                applyVesselPolArcs(view);
                applyTacticalLabels(view);
            } catch (_) {}
        }
        window.globalFleetGlobeLastRender = {
            key,
            vesselCount: view.vessels.length,
            renderedAt: Date.now(),
            status: view.vessels.length > 0 ? 'rendered' : 'empty-safe',
            renderMode: view.lastVesselRenderMode || view.renderMode || 'points',
            vectorFallbackReason: view.vectorFallbackReason || null
        };
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

    function isViewVisible(view) {
        return Boolean(view?.container?.isConnected && view.container.getClientRects().length);
    }

    function resize(key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view || view.resizeFrameId) return;
        view.resizeFrameId = requestAnimationFrame(() => {
            view.resizeFrameId = null;
            if (!isViewVisible(view)) return;
            const size = getContainerSize(view.container);
            if (size.width <= 1 || size.height <= 1) return;
            if (view.pendingVesselSync) {
                view.pendingVesselSync = false;
                updateVessels(null, key);
            }
            if (size.width === view.lastWidth && size.height === view.lastHeight) return;
            view.lastWidth = size.width;
            view.lastHeight = size.height;
            view.globe.width(size.width).height(size.height);
        });
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
        view.globe.pointOfView(view.initialView || INITIAL_VIEW, CAMERA_TRANSITION_MS);
        setAutoRotate(false, key);
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

    function disposeSceneResources(globe) {
        const scene = globe?.scene?.();
        scene?.traverse?.((object) => {
            object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.filter(Boolean).forEach((material) => {
                Object.values(material).forEach((value) => value?.isTexture && value.dispose?.());
                material.dispose?.();
            });
        });
    }

    function destroy(key = DEFAULT_KEY) {
        const pendingMountFrameId = pendingMountFrames.get(key);
        if (pendingMountFrameId) cancelAnimationFrame(pendingMountFrameId);
        pendingMountFrames.delete(key);
        const activeVesselFocusTimer = activeVesselFocusTimers.get(key);
        if (activeVesselFocusTimer) window.clearTimeout(activeVesselFocusTimer);
        activeVesselFocusTimers.delete(key);
        const view = getView(key);
        if (!view) return;
        view.resizeObserver?.disconnect();
        if (view.resizeFrameId) cancelAnimationFrame(view.resizeFrameId);
        view.controls?.removeEventListener?.('change', view.handleControlsChange);
        view.controls?.removeEventListener?.('start', view.handleInteractionStart);
        view.container.removeEventListener?.('pointerdown', view.handleContainerPointerDown);
        view.rotationButton?.removeEventListener?.('click', view.handleRotationToggle);
        view.rotationButton?.removeEventListener?.('pointerdown', view.handleRotationControlPointerDown);
        const renderer = view.globe?.renderer?.();
        view.globe?._destructor?.();
        disposeSceneResources(view.globe);
        renderer?.renderLists?.dispose?.();
        renderer?.dispose?.();
        renderer?.forceContextLoss?.();
        view.container.replaceChildren();
        delete view.container.dataset.renderKey;
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
        const initialView = normalizeInitialView(options.initialView);
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
            const pendingMountFrameId = pendingMountFrames.get(key);
            if (pendingMountFrameId) cancelAnimationFrame(pendingMountFrameId);
            pendingMountFrames.set(key, requestAnimationFrame(() => {
                pendingMountFrames.delete(key);
                mount(options);
            }));
            return null;
        }
        const pendingMountFrameId = pendingMountFrames.get(key);
        if (pendingMountFrameId) cancelAnimationFrame(pendingMountFrameId);
        pendingMountFrames.delete(key);
        const existing = getView(key);
        if (existing && existing.container === container) {
            updateVessels(options.vesselsData ?? null, key);
            if (options.restoreRouteState === false) {
                setRouteSegments({}, key, { focus: false, persist: false }, { ballast: [], laden: [] });
            }
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
            initialView,
            initialViewDuration: Math.max(0, toFiniteNumber(options.initialViewDuration, 0) || 0),
            hoveredVessel: null,
            selectedVessel: null,
            selectedVesselIdentity: null,
            renderMode: 'points',
            lastVesselRenderMode: null,
            vectorFallbackReason: null,
            autoRotate: false,
            portDetailActive: false,
            focusFirstVesselEnabled: options.focusFirstVessel !== false,
            hasFocusedVessel: false,
            resizeObserver: null,
            resizeFrameId: null,
            lastWidth: 0,
            lastHeight: 0,
            pendingVesselSync: false,
            rotationButton: null,
            handleControlsChange: null,
            handleInteractionStart: null,
            handleContainerPointerDown: null,
            handleRotationToggle: null,
            handleRotationControlPointerDown: null
        };
        views.set(key, view);
        try {
            const fallbackGlobeMaterial = createFallbackGlobeMaterial();
            const globe = window.Globe({ animateIn: false, waitForGlobeReady: false })(container)
                .width(size.width)
                .height(size.height)
                .backgroundColor('rgba(0,0,0,0)');
            if (fallbackGlobeMaterial) globe.globeMaterial(fallbackGlobeMaterial);
            view.globe = globe
                .globeImageUrl(EARTH_IMAGE_URL)
                .bumpImageUrl(EARTH_TOPOLOGY_URL)
                .showAtmosphere(true)
                .atmosphereColor('#39d7e8')
                .atmosphereAltitude(0.16)
                .onZoom((pointOfView) => handleGlobeZoom(view, pointOfView))
                .arcStartLat('startLat')
                .arcStartLng('startLng')
                .arcEndLat('endLat')
                .arcEndLng('endLng')
                .arcColor('color')
                .arcAltitudeAutoScale(0.18)
                .arcStroke(0.22)
                .arcDashLength(0.28)
                .arcDashGap(0.9)
                .arcDashInitialGap((arc) => ((Number(arc?.vessel?.sourceIndex) || 0) % 10) / 10)
                .arcDashAnimateTime(2600)
                .arcLabel((arc) => getVesselTacticalLabel(view, arc?.vessel))
                .arcsTransitionDuration(0)
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
                .labelSize((label) => label?.size || 1.05)
                .labelDotRadius((label) => label?.dotRadius || 0)
                .labelAltitude((label) => Number.isFinite(Number(label?.altitude)) ? Number(label.altitude) : SURFACE_ALTITUDE)
                .labelRotation((label) => Number.isFinite(Number(label?.rotation)) ? Number(label.rotation) : 0)
                .labelResolution(8)
                .labelLabel((label) => label?.text || '')
                .labelsTransitionDuration(0)
                .labelsData([]);
            configurePortTileEngine(view);
            if (!configureVesselVectorLayer(view)) {
                configureVesselPointFallback(view, hasCompatibleThreeNamespace() ? 'three-layer-configuration-error' : 'three-unavailable');
            }
            view.globe.pointOfView(view.initialView, view.initialViewDuration);
            view.controls = view.globe.controls();
            view.controls.enableDamping = true;
            view.controls.dampingFactor = 0.08;
            view.controls.autoRotate = false;
            view.controls.autoRotateSpeed = 0.45;
            view.handleControlsChange = null;
            view.handleInteractionStart = () => setAutoRotate(false, key);
            view.handleContainerPointerDown = (event) => {
                if (event.target?.closest?.('.global-fleet-rotation-toggle')) return;
                setAutoRotate(false, key);
            };
            if (view.handleControlsChange) view.controls.addEventListener?.('change', view.handleControlsChange);
            view.controls.addEventListener?.('start', view.handleInteractionStart);
            view.container.addEventListener('pointerdown', view.handleContainerPointerDown);
            updatePortDetailForAltitude(view, view.initialView.altitude);
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
        const activeVessel = window.GlobalStore?.activeVessel || window.activeVessel;
        if (activeVessel && options.focusActiveVesselOnMount !== false) {
            window.setTimeout(() => focusActiveVesselWhenReady(activeVessel, key), 0);
        }
        return view.adapter;
    }

    function syncAllViews() {
        views.forEach((view) => {
            if (!isViewVisible(view)) {
                view.pendingVesselSync = true;
                return;
            }
            updateVessels(null, view.key);
        });
    }

    window.addEventListener('ais:filtered-vessels-updated', syncAllViews);
    window.addEventListener('databridge:filtered-vessels-updated', syncAllViews);
    window.addEventListener('radar-fleet-updated', syncAllViews);
    function ensureActiveVesselInView(vessel, key) {
        const normalized = normalizeVessel(vessel);
        const view = getView(key) || getView(DEFAULT_KEY);
        if (!normalized || !view) return false;
        if (!findMatchingVessel(view.vessels, normalized)) {
            updateVessels([...view.vessels, normalized], view.key);
        }
        return focusActiveVessel(normalized, view.key);
    }

    function focusActiveVesselWhenReady(vessel, key = 'density', attempt = 0) {
        if (ensureActiveVesselInView(vessel, key)) {
            activeVesselFocusTimers.delete(key);
            return true;
        }
        if (attempt >= 5) {
            activeVesselFocusTimers.delete(key);
            return false;
        }
        const activeTimer = activeVesselFocusTimers.get(key);
        if (activeTimer) window.clearTimeout(activeTimer);
        activeVesselFocusTimers.set(key, window.setTimeout(() => {
            focusActiveVesselWhenReady(vessel, key, attempt + 1);
        }, 300));
        return false;
    }
    window.addEventListener('vessel-selection:changed', (event) => {
        const activeVessel = event?.detail?.activeVessel
            || window.GlobalStore?.activeVessel
            || window.activeVessel;
        if (getView('density')) focusActiveVesselWhenReady(activeVessel, 'density');
        ['main', 'tracking'].forEach(key => {
            if (getView(key)) focusActiveVesselWhenReady(activeVessel, key);
        });
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
        getVesselColor,
        normalizeVessels: prepareVessels,
        getInstance: (key = DEFAULT_KEY) => getView(key)?.adapter || null,
        getVessels: (key = DEFAULT_KEY) => getView(key)?.vessels || [],
        tacticalProps: Object.freeze({
            commercialColor: COMMERCIAL_VESSEL_COLOR,
            tankerColor: TANKER_VESSEL_COLOR,
            noiseColor: NOISE_VESSEL_COLOR,
            hoverColor: POINT_HOVER_COLOR,
            altitude: SURFACE_ALTITUDE,
            vectorRadius: VESSEL_VECTOR_RADIUS,
            vectorLength: VESSEL_VECTOR_LENGTH,
            vectorSegments: VESSEL_VECTOR_SEGMENTS
        })
    });

    window.GlobalFleetGlobe = globalFleetGlobe;
    window.GlobeMapView = globalFleetGlobe;
    window.getVesselColor = getVesselColor;
})(window, document);
