(function (window, document) {
    'use strict';

    const views = new Map();
    const DEFAULT_KEY = 'main';
    const VESSEL_FOCUS_ALTITUDE = 500 / 6371;

    function toFiniteNumber(...values) {
        for (const value of values) {
            const number = Number(value);
            if (Number.isFinite(number)) return number;
        }
        return null;
    }

    function normalizeVessel(vessel, index) {
        if (!vessel || typeof vessel !== 'object') return null;
        const metadata = vessel.MetaData || vessel.metadata || {};
        const position = vessel.PositionReport || vessel.position || {};
        const lat = toFiniteNumber(vessel.lat, vessel.latitude, vessel.AIS_Live_Lat, metadata.lat, metadata.latitude, position.Latitude);
        const lng = toFiniteNumber(vessel.lng, vessel.lon, vessel.longitude, vessel.AIS_Live_Lon, metadata.lng, metadata.lon, metadata.longitude, position.Longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        vessel.lat = lat;
        vessel.lng = lng;
        vessel.latitude = lat;
        vessel.longitude = lng;
        vessel.name = vessel.name || vessel.vesselName || vessel.ShipName || metadata.ShipName || `Buque ${index + 1}`;
        vessel.vesselName = vessel.vesselName || vessel.name;
        return vessel;
    }

    function prepareVessels(vesselsData) {
        return (Array.isArray(vesselsData) ? vesselsData : [])
            .map(normalizeVessel)
            .filter(Boolean);
    }

    function getVesselsData() {
        if (Array.isArray(window.vessels_data)) return window.vessels_data;
        if (window.GlobalStore && typeof window.GlobalStore.getRawVessels === 'function') {
            const raw = window.GlobalStore.getRawVessels();
            if (Array.isArray(raw) && raw.length) return raw;
        }
        if (window.GlobalStore && typeof window.GlobalStore.getVessels === 'function') return window.GlobalStore.getVessels();
        return [];
    }

    function getView(key = DEFAULT_KEY) {
        return views.get(key) || null;
    }

    function getRoutePortsFromResult(result) {
        const coordinates = result?.coordinates || {};
        return { pol: coordinates.pol || null, pod: coordinates.pod || null };
    }

    function createPortLabel(role, port) {
        const lat = toFiniteNumber(port?.lat, port?.latitude);
        const lng = toFiniteNumber(port?.lng, port?.lon, port?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const name = String(port?.name || role).split(',')[0].trim() || role;
        return {
            kind: 'port',
            role,
            lat,
            lng,
            name,
            text: `${role} · ${name}`,
            color: role === 'POL' ? '#34d399' : '#60a5fa'
        };
    }

    function clusterVessels(vessels, altitude) {
        const cellSize = Math.max(0.35, Math.min(18, Number(altitude || 2) * 4.2));
        const buckets = new Map();

        vessels.forEach((vessel) => {
            const latCell = Math.floor((vessel.lat + 90) / cellSize);
            const lngCell = Math.floor((vessel.lng + 180) / cellSize);
            const key = `${latCell}:${lngCell}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(vessel);
        });

        return Array.from(buckets.values()).map((members) => {
            if (members.length === 1) {
                return { ...members[0], kind: 'vessel', count: 1, members };
            }
            const lat = members.reduce((sum, vessel) => sum + vessel.lat, 0) / members.length;
            const lng = members.reduce((sum, vessel) => sum + vessel.lng, 0) / members.length;
            return {
                kind: 'cluster',
                lat,
                lng,
                count: members.length,
                members,
                name: `${members.length} buques`
            };
        });
    }

    function renderLabels(view) {
        const clusterLabels = view.clusters
            .filter((cluster) => cluster.count > 1)
            .map((cluster) => ({
                ...cluster,
                kind: 'cluster-label',
                text: String(cluster.count),
                color: '#f8fafc'
            }));
        const selectedLabel = view.selectedVessel ? [{
            kind: 'selected-vessel',
            lat: view.selectedVessel.lat,
            lng: view.selectedVessel.lng,
            text: view.selectedVessel.name,
            color: '#fbbf24'
        }] : [];
        view.globe.labelsData([...view.portLabels, ...clusterLabels, ...selectedLabel]);
    }

    function renderClusters(view, force = false) {
        const altitude = view.globe.pointOfView()?.altitude || 2;
        const zoomBucket = Math.round(altitude * 4) / 4;
        if (!force && zoomBucket === view.zoomBucket) return;
        view.zoomBucket = zoomBucket;
        view.clusters = clusterVessels(view.vessels, altitude);
        view.globe.pointsData(view.clusters);
        renderLabels(view);
    }

    function focusVessel(vesselOrId, key = 'density') {
        const view = getView(key) || getView(DEFAULT_KEY);
        if (!view) return false;
        const query = String(typeof vesselOrId === 'object'
            ? (vesselOrId.mmsi || vesselOrId.imo || vesselOrId.vesselName || vesselOrId.name || '')
            : vesselOrId || '').toLowerCase();
        const vessel = typeof vesselOrId === 'object' && normalizeVessel(vesselOrId, 0)
            ? vesselOrId
            : view.vessels.find((candidate) => [candidate.mmsi, candidate.imo, candidate.vesselName, candidate.name]
                .some((value) => String(value || '').toLowerCase().includes(query)));
        if (!vessel) return false;

        view.selectedVessel = vessel;
        renderLabels(view);
        view.globe.pointOfView({ lat: vessel.lat, lng: vessel.lng, altitude: VESSEL_FOCUS_ALTITUDE }, 1250);
        return true;
    }

    function focusCoordinates(lat, lng, key = 'density', duration = 1000) {
        const view = getView(key) || getView(DEFAULT_KEY);
        const latitude = toFiniteNumber(lat);
        const longitude = toFiniteNumber(lng);
        if (!view || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
        return focusVessel({ lat: latitude, lng: longitude, name: 'Posición seleccionada' }, view.key) || Boolean(view.globe.pointOfView({ lat: latitude, lng: longitude, altitude: 0.75 }, duration));
    }

    function updateVessels(vesselsData = getVesselsData(), key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return [];
        view.vessels = prepareVessels(vesselsData);
        renderClusters(view, true);
        return view.vessels;
    }

    function setRoute(pol, pod, key = DEFAULT_KEY, options = {}) {
        const view = getView(key);
        if (!view) return [];
        const polLabel = createPortLabel('POL', pol);
        const podLabel = createPortLabel('POD', pod);
        view.portLabels = [polLabel, podLabel].filter(Boolean);
        view.routeArc = polLabel && podLabel ? [{
            startLat: polLabel.lat,
            startLng: polLabel.lng,
            endLat: podLabel.lat,
            endLng: podLabel.lng,
            name: `${polLabel.name} → ${podLabel.name}`
        }] : [];
        view.globe.arcsData(view.routeArc);
        renderLabels(view);

        if (view.routeArc.length && options.focus !== false) {
            view.globe.pointOfView({
                lat: (polLabel.lat + podLabel.lat) / 2,
                lng: (polLabel.lng + podLabel.lng) / 2,
                altitude: 1.65
            }, 900);
        }
        return view.routeArc;
    }

    function setRouteResult(result, key = DEFAULT_KEY, options = {}) {
        const { pol, pod } = getRoutePortsFromResult(result);
        return setRoute(pol, pod, key, options);
    }

    function resize(key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return;
        view.globe.width(view.container.clientWidth || 1);
        view.globe.height(view.container.clientHeight || 1);
    }

    function destroy(key = DEFAULT_KEY) {
        const view = getView(key);
        if (!view) return;
        view.resizeObserver?.disconnect();
        if (view.clickHandler) view.container.removeEventListener('click', view.clickHandler);
        if (typeof view.globe._destructor === 'function') view.globe._destructor();
        view.container.replaceChildren();
        views.delete(key);
        if (key === DEFAULT_KEY) window.map = null;
        if (key === 'density') window.mapaAIS = null;
    }

    function createMapAdapter(view) {
        const adapter = view.globe;
        adapter.seaCharterEngine = 'globe-gl';
        adapter.resize = () => resize(view.key);
        adapter.invalidateSize = adapter.resize;
        adapter.getZoom = () => Math.max(2, 11 - Math.round((adapter.pointOfView()?.altitude || 2) * 4));
        adapter.setView = (coordinates, zoom, options = {}) => {
            const lat = Array.isArray(coordinates) ? coordinates[0] : coordinates?.lat;
            const lng = Array.isArray(coordinates) ? coordinates[1] : (coordinates?.lng ?? coordinates?.lon);
            const altitude = Math.max(0.35, Math.min(2.5, (12 - Number(zoom || 5)) / 4));
            adapter.pointOfView({ lat: Number(lat), lng: Number(lng), altitude }, options.animate === false ? 0 : 1000);
            return adapter;
        };
        adapter.flyTo = (coordinates, zoom) => adapter.setView(coordinates, zoom, { animate: true });
        adapter.remove = () => destroy(view.key);
        adapter.removeLayer = () => adapter;
        adapter.eachLayer = () => adapter;
        return adapter;
    }

    function mount(options = {}) {
        const key = options.key || DEFAULT_KEY;
        const containerId = options.containerId || (key === 'density' ? 'ais-map' : 'map-container');
        const nextContainer = document.getElementById(containerId);
        if (!nextContainer) return null;
        const existing = getView(key);
        if (existing && existing.container === nextContainer) {
            updateVessels(options.vesselsData || getVesselsData(), key);
            resize(key);
            return existing.globe;
        }
        if (existing) destroy(key);

        const GlobeGlobe = window.GlobeGlobe || window.Globe;
        if (typeof GlobeGlobe !== 'function') {
            console.error('Globe.gl no está disponible; no se puede iniciar la vista marítima 3D.');
            return null;
        }

        nextContainer.replaceChildren();
        const globe = GlobeGlobe()(nextContainer)
            .backgroundColor('#071522')
            .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
            .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
            .showAtmosphere(true)
            .atmosphereColor('#7dd3fc')
            .atmosphereAltitude(0.16)
            .pointLat('lat')
            .pointLng('lng')
            .pointAltitude((point) => point.kind === 'cluster' ? 0.035 : 0.018)
            .pointRadius((point) => point.kind === 'cluster' ? Math.min(0.75, 0.28 + Math.log2(point.count) * 0.11) : 0.24)
            .pointResolution(16)
            .pointColor((point) => point.kind === 'cluster' ? '#0ea5e9' : '#f59e0b')
            .pointsMerge(false)
            .pointLabel((point) => point.kind === 'cluster' ? `${point.count} buques` : point.name)
            .labelLat('lat')
            .labelLng('lng')
            .labelText('text')
            .labelColor('color')
            .labelAltitude((label) => label.kind === 'port' ? 0.045 : 0.06)
            .labelSize((label) => label.kind === 'port' ? 1.25 : (label.kind === 'selected-vessel' ? 1.05 : 0.95))
            .labelDotRadius((label) => label.kind === 'port' ? 0.34 : (label.kind === 'selected-vessel' ? 0.28 : 0.5))
            .labelResolution(3)
            .arcStartLat('startLat')
            .arcStartLng('startLng')
            .arcEndLat('endLat')
            .arcEndLng('endLng')
            .arcColor(() => ['#22d3ee', '#f59e0b'])
            .arcAltitudeAutoScale(0.32)
            .arcStroke(0.7)
            .arcDashLength(0.55)
            .arcDashGap(0.18)
            .arcDashAnimateTime(1800)
            .arcLabel('name')
            .arcsData([]);

        const view = {
            key,
            container: nextContainer,
            globe,
            vessels: [],
            clusters: [],
            portLabels: [],
            routeArc: [],
            selectedVessel: null,
            zoomBucket: null,
            clickHandler: null,
            nativeClickAt: 0,
            resizeObserver: null
        };
        views.set(key, view);
        createMapAdapter(view);

        globe.onZoom(() => renderClusters(view));
        globe.onPointClick((point) => {
            view.nativeClickAt = Date.now();
            if (point.kind === 'cluster' && point.members?.length) {
                globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: Math.max(0.35, (globe.pointOfView()?.altitude || 2) * 0.55) }, 900);
            } else {
                focusVessel(point, key);
            }
        });
        globe.onLabelClick((label) => {
            if (label.kind === 'cluster-label' && label.members?.length) {
                globe.pointOfView({ lat: label.lat, lng: label.lng, altitude: Math.max(0.35, (globe.pointOfView()?.altitude || 2) * 0.55) }, 900);
            }
        });

        view.clickHandler = (event) => {
            if (Date.now() - view.nativeClickAt < 100) return;
            const bounds = nextContainer.getBoundingClientRect();
            const clickX = event.clientX - bounds.left;
            const clickY = event.clientY - bounds.top;
            let nearest = null;
            let nearestDistance = 10;

            view.clusters.forEach((point) => {
                const screen = globe.getScreenCoords(point.lat, point.lng, point.kind === 'cluster' ? 0.035 : 0.018);
                const distance = Math.hypot(screen.x - clickX, screen.y - clickY);
                if (distance <= nearestDistance) {
                    nearest = point;
                    nearestDistance = distance;
                }
            });

            if (!nearest) return;
            if (nearest.kind === 'cluster' && nearest.members?.length) {
                globe.pointOfView({ lat: nearest.lat, lng: nearest.lng, altitude: Math.max(0.35, (globe.pointOfView()?.altitude || 2) * 0.55) }, 900);
            } else {
                focusVessel(nearest, key);
            }
        };
        nextContainer.addEventListener('click', view.clickHandler);

        globe.controls().autoRotate = options.autoRotate !== false;
        globe.controls().autoRotateSpeed = key === 'density' ? 0.16 : 0.28;
        globe.controls().enableDamping = true;
        globe.pointOfView({ lat: 25, lng: 0, altitude: 2.15 });

        view.resizeObserver = new ResizeObserver(() => resize(key));
        view.resizeObserver.observe(nextContainer);
        resize(key);
        updateVessels(options.vesselsData || getVesselsData(), key);

        if (key === DEFAULT_KEY) window.map = globe;
        if (key === 'density') window.mapaAIS = globe;
        return globe;
    }

    window.addEventListener('ais:vessels-updated', (event) => {
        const vessels = event.detail?.rawVessels?.length ? event.detail.rawVessels : (event.detail?.vessels || getVesselsData());
        views.forEach((view) => updateVessels(vessels, view.key));
    });

    window.GlobeMapView = Object.freeze({
        mount,
        destroy,
        resize,
        updateVessels,
        setRoute,
        setRouteResult,
        focusVessel,
        focusCoordinates,
        getInstance: (key = DEFAULT_KEY) => getView(key)?.globe || null,
        getVessels: (key = DEFAULT_KEY) => getView(key)?.vessels || []
    });
})(window, document);
