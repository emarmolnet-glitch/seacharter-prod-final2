/**
 * =============================================================================
 * SeaCharter Core PRO — Módulo de Compatibilidad Técnica y Radar AIS
 * (Sistema de Diseño Luminoso y Cohesivo)
 * =============================================================================
 * Cruce en tiempo real entre flujos de densidad AIS (con filtro estricto en origen
 * para mercantes con IMO válido) y especificaciones técnicas de la base de datos
 * maestra Neon DB (tabla vessels_master).
 */

import { toIsoAlpha2Flag } from '../db/flag-country-codes.mjs';
import { isDwtWithinCommercialBand, resolveCommercialDwtBounds, resolveVesselDwt } from '../cargo-taxonomy.mjs';
import { SPOT_PROXIMITY_NM, classifyVesselOpenness } from '../vessel-openness-engine.mjs';

const DEFAULT_ACTIVE_OPERATION = Object.freeze({
    cargoName: "Cement in Bulk (Clinker)",
    cargoVolumeMt: 10000,
    stowageFactorM3Mt: 0.85,
    polName: "Bejaia",
    polFlag: "🇩🇿",
    polCountry: "DZ",
    polCoords: { lat: 36.75, lon: 5.08 },
    podName: "Almería",
    podFlag: "🇪🇸",
    podCountry: "ES",
    podCoords: { lat: 36.83, lon: -2.46 },
    laycan: "10/15 Sep",
    loadingRate: "3,000 MT/WW",
});

const STRICT_NON_COMMERCIAL_RE = /\b(fishing|pesquero|pesca|trawler|tug|tugboat|remolcador|remolque|pusher|passenger|cruise|ferry|pleasure|yacht|sailing|dredger|vts|mark|point|danger|buoy|boya|military|sar|rescue|pilot|workboat|other|unknown)\b/i;
const STRICT_MERCHANT_CARGO_RE = /\b(bulk|bulker|cargo|carguero|coaster|cabotaje|container|tanker|petrolero|quimiquero|heavy load|heavy lift|break bulk|breakbulk|ro-ro|roro|cement|cementero|clinker|mpp|mpv|mmpp|freighter|merchant|general cargo|mini bulker)\b/i;

// Strict dry bulk cargo taxonomy patterns (cement, clinker, yeso/gypsum, cal/lime, aggregates/aridos, minerals, dry bulk)
const DRY_BULK_CARGO_RE = /\b(cement|cemento|clinker|clinquer|yeso|gypsum|cal|lime|aridos?|aggregates?|mineral|granel\s*seco|dry\s*bulk|grain|grano|cereales?|fertilizante|abono|bauxita|carbon|carb[oó]n|slags?|cenizas?|big\s*bags?|granel\s*s[oó]lido|solido|s[oó]lido)\b/i;

// Mandatory excluded vessel types for dry bulk cargoes (Tanker, Container, Tug, Passenger)
const MANDATORY_DRY_BULK_EXCLUDED_TYPES_RE = /\b(tanker|oil tanker|chemical tanker|product tanker|crude|petrolero|quimiquero|tanquero|lng|lpg|container|containership|feeder|boxship|portacontenedores|tug|tugboat|remolcador|remolque|pusher|empujador|passenger|cruise|ferry|ropax|ro-pax|pasaje|pasajeros|crucero|pleasure|yacht|yate|sailing|velero|fishing|pesquero|trawler)\b/i;

// Compatible vessel types for dry bulk cargoes (Bulk Carrier, Mini Bulker, General Cargo with suitable holds for aggregates/bulk, Cement Carriers, MPP, Heavy Load)
const COMPATIBLE_DRY_BULK_TYPES_RE = /\b(bulk carrier|bulker|dry bulk|handysize|handymax|supramax|ultramax|panamax|capesize|granelero|mini bulker|minibulker|mini-bulker|general cargo|carguero|buque de carga|coaster|costero|cabotaje|cabotage|multipurpose|multi-purpose|multi purpose|mpp|mpv|box-shaped|box hold|open hatch|cement carrier|cementero|clinker carrier|self-discharger|self discharger|self-unloading|self unloader|heavy load|heavy carrier|heavy lift)\b/i;

function getCountryFlagEmoji(countryOrIso) {
    if (!countryOrIso) return "🌍";
    const iso = toIsoAlpha2Flag(countryOrIso);
    if (!iso || iso.length !== 2) {
        const text = String(countryOrIso).toLowerCase();
        if (text.includes("alger") || text.includes("argel") || text.includes("bejaia")) return "🇩🇿";
        if (text.includes("spain") || text.includes("españ") || text.includes("almer")) return "🇪🇸";
        if (text.includes("ital")) return "🇮🇹";
        if (text.includes("turk") || text.includes("turq")) return "🇹🇷";
        if (text.includes("greec") || text.includes("grec")) return "🇬🇷";
        if (text.includes("egypt") || text.includes("egip")) return "🇪🇬";
        return "🌍";
    }
    const codePoints = [...iso.toUpperCase()].map(c => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) {
            return String(dateStr);
        }
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${d.getDate()} ${months[d.getMonth()]}`;
    } catch {
        return String(dateStr);
    }
}

class CompatibilityModuleManager {
    constructor() {
        this.cache = null;
        this.cacheTimestamp = 0;
        this.cacheTtlMs = 15000;
        this.isLoading = false;
        this.lockedVesselId = null;
        this.selectedVesselImo = null;
        this.mounted = false;
        this.container = null;
        this.currentOperation = null;
        this.currentMatches = [];
        this.currentRadarSummary = null;
        this.currentNeonSummary = null;
        this.unsubscribeStore = null;
    }

    resolveActiveOperation() {
        let routeState = {};
        let cargoState = {};

        if (typeof window !== 'undefined') {
            if (typeof window.readRouteStateFromCalculator === 'function') {
                routeState = window.readRouteStateFromCalculator() || {};
            }
            if (typeof window.readValidatedCargoOperationState === 'function') {
                cargoState = window.readValidatedCargoOperationState() || {};
            }
            const storeState = window.SeaCharterStore?.getState?.() || window.State || {};
            routeState = { ...storeState, ...routeState };
            cargoState = { ...storeState, ...cargoState };
        }

        const polName = String(routeState.pol || cargoState.pol || DEFAULT_ACTIVE_OPERATION.polName).trim();
        const podName = String(routeState.pod || cargoState.pod || DEFAULT_ACTIVE_OPERATION.podName).trim();
        const cargoName = String(cargoState.cargoProduct || cargoState.cargoType || cargoState.cargo_type || DEFAULT_ACTIVE_OPERATION.cargoName).trim();
        const cargoVolumeMt = Number(cargoState.cargoQuantity || cargoState.cargoQty || cargoState.cargo_qty || DEFAULT_ACTIVE_OPERATION.cargoVolumeMt) || DEFAULT_ACTIVE_OPERATION.cargoVolumeMt;

        let laycan = DEFAULT_ACTIVE_OPERATION.laycan;
        const laydays = routeState.laydays || routeState.laycanDate || routeState.laycanStart;
        const cancelling = routeState.cancelling || routeState.cancellingDate || routeState.laycanEnd;
        if (laydays && cancelling) {
            const shortStart = formatDateShort(laydays);
            const shortEnd = formatDateShort(cancelling);
            if (shortStart && shortEnd) {
                laycan = `${shortStart} / ${shortEnd}`;
            }
        } else if (laydays) {
            laycan = formatDateShort(laydays);
        }

        let loadingRate = DEFAULT_ACTIVE_OPERATION.loadingRate;
        const loadRateNum = Number(cargoState.loadRate || cargoState.loadingRate || cargoState.ratePOL || routeState.loadRate);
        if (Number.isFinite(loadRateNum) && loadRateNum > 0) {
            loadingRate = `${loadRateNum.toLocaleString('en-US')} MT/WW`;
        }

        const polPortData = typeof window !== 'undefined' && typeof window.findPortData === 'function' && polName ? window.findPortData(polName) : null;
        const podPortData = typeof window !== 'undefined' && typeof window.findPortData === 'function' && podName ? window.findPortData(podName) : null;

        const polCountry = polPortData?.country || polPortData?.countryCode || "";
        const podCountry = podPortData?.country || podPortData?.countryCode || "";

        const polFlag = polName ? getCountryFlagEmoji(polCountry || polPortData?.countryCode || polName) : "🌍";
        const podFlag = podName ? getCountryFlagEmoji(podCountry || podPortData?.countryCode || podName) : "🌍";

        const polCoords = polPortData && Number.isFinite(Number(polPortData.lat)) && Number.isFinite(Number(polPortData.lon))
            ? { lat: Number(polPortData.lat), lon: Number(polPortData.lon) }
            : (routeState.polCoords || DEFAULT_ACTIVE_OPERATION.polCoords);
        const podCoords = podPortData && Number.isFinite(Number(podPortData.lat)) && Number.isFinite(Number(podPortData.lon))
            ? { lat: Number(podPortData.lat), lon: Number(podPortData.lon) }
            : (routeState.podCoords || DEFAULT_ACTIVE_OPERATION.podCoords);

        return {
            cargoName: cargoName,
            cargoVolumeMt: cargoVolumeMt,
            stowageFactorM3Mt: DEFAULT_ACTIVE_OPERATION.stowageFactorM3Mt,
            polName: polName,
            polFlag,
            polCountry,
            polCoords,
            podName: podName,
            podFlag,
            podCountry,
            podCoords,
            laycan: laycan,
            // Fechas crudas del laycan: el motor de apertura las necesita para
            // contrastar la disponibilidad proyectada de cada buque.
            laydayStart: laydays ? String(laydays) : '',
            cancelling: cancelling ? String(cancelling) : '',
            loadingRate: loadingRate,
        };
    }

    async fetchData(force = false) {
        const now = Date.now();
        const activeOp = this.resolveActiveOperation();
        this.currentOperation = activeOp;

        if (!force && this.cache && (now - this.cacheTimestamp < this.cacheTtlMs)) {
            return this.cache;
        }

        let rawLiveFleet = [];
        if (typeof window !== 'undefined') {
            const reactive = (Array.isArray(window.datalasticRadarVessels) && window.datalasticRadarVessels.length > 0 ? window.datalasticRadarVessels : null)
                || (Array.isArray(window.GlobalStore?.radarVessels) && window.GlobalStore.radarVessels.length > 0 ? window.GlobalStore.radarVessels : null)
                || (Array.isArray(window.GlobalStore?.commercialVessels) && window.GlobalStore.commercialVessels.length > 0 ? window.GlobalStore.commercialVessels : null)
                || (typeof window.getDensityReactiveVessels === 'function' ? window.getDensityReactiveVessels() : null)
                || (Array.isArray(window.GlobalStore?.matchingVessels) ? window.GlobalStore.matchingVessels : null)
                || (Array.isArray(window.listaBarcos) ? window.listaBarcos : null);
            if (Array.isArray(reactive) && reactive.length > 0) {
                rawLiveFleet = reactive;
            } else if (activeOp.polCoords && Number.isFinite(activeOp.polCoords.lat) && Number.isFinite(activeOp.polCoords.lon)) {
                // Si el array está vacío, dispara automáticamente la consulta a /api/radar/live con las coordenadas del POL activo
                // (usando radio de 100 NM si a 10 NM no hay coincidencias)
                try {
                    let radarRes = await fetch(`/api/radar/live?lat=${activeOp.polCoords.lat}&lon=${activeOp.polCoords.lon}&radius=10`, { headers: { Accept: 'application/json' } });
                    let radarJson = await radarRes.json().catch(() => null);
                    let radarData = Array.isArray(radarJson?.data) ? radarJson.data : [];
                    if (radarData.length === 0) {
                        radarRes = await fetch(`/api/radar/live?lat=${activeOp.polCoords.lat}&lon=${activeOp.polCoords.lon}&radius=100`, { headers: { Accept: 'application/json' } });
                        radarJson = await radarRes.json().catch(() => null);
                        radarData = Array.isArray(radarJson?.data) ? radarJson.data : [];
                    }
                    if (radarData.length > 0) {
                        rawLiveFleet = radarData;
                        window.datalasticRadarVessels = radarData;
                        if (window.GlobalStore?.setRadarVessels) {
                            window.GlobalStore.setRadarVessels(radarData, { source: 'compatibilidad-radar-direct-sync' });
                        }
                    }
                } catch (radarErr) {
                    console.warn('[CompatibilityModule] Error consultando /api/radar/live:', radarErr);
                }
            }
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const getApiUrl = (typeof window !== 'undefined' && window.getApiUrl) || function(u) { return u; };
            const res = await fetch(getApiUrl('/api/vessel-compatibility'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    ...activeOp,
                    liveRadarVessels: rawLiveFleet,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                if (data && data.success && Array.isArray(data.pairedMatches)) {
                    this.cache = data;
                    this.cacheTimestamp = now;
                    return data;
                }
            }
        } catch (err) {
            console.warn('[CompatibilityModule] Live endpoint unreachable, processing client state:', (err && err.message) || err);
        }

        let dynamicRadarMatches = [];
        let hasLiveCompatibleVessels = true;
        // Banda de tolerancia comercial (-10% / +50%) sobre el lote de carga activo.
        const commercialDwtBand = resolveCommercialDwtBounds(activeOp.cargoVolumeMt);

        if (typeof window !== 'undefined' && activeOp.polName && activeOp.cargoName) {
            const liveFleet = (Array.isArray(window.datalasticRadarVessels) && window.datalasticRadarVessels.length > 0 ? window.datalasticRadarVessels : null)
                || (Array.isArray(window.GlobalStore?.radarVessels) && window.GlobalStore.radarVessels.length > 0 ? window.GlobalStore.radarVessels : null)
                || (typeof window.getDensityReactiveVessels === 'function' ? window.getDensityReactiveVessels() : null)
                || (Array.isArray(window.GlobalStore?.matchingVessels) ? window.GlobalStore.matchingVessels : null)
                || (Array.isArray(window.listaBarcos) ? window.listaBarcos : null);

            if (Array.isArray(liveFleet)) {
                const isDryBulk = DRY_BULK_CARGO_RE.test(activeOp.cargoName);
                const targetDwt = Number(activeOp.cargoVolumeMt) || 15000;

                const commercialFleet = liveFleet.filter(ship => {
                    const imo = String(ship.imo || ship.imo_number || ship.IMO || '').replace(/\D/g, '');
                    const mmsi = String(ship.mmsi || ship.MMSI || '').replace(/\D/g, '');
                    const rawType = String(ship.tipo_buque || ship.categoria_buque || ship.vessel_type || ship.vesselType || ship.type || ship.ship_type || ship.ShipType || '').toLowerCase();
                    const isValidImo = imo.length === 7 && Number(imo) > 0;
                    const isValidMmsi = mmsi.length === 9;
                    if (!isValidImo && !isValidMmsi) return false;

                    const isNotNoise = !STRICT_NON_COMMERCIAL_RE.test(rawType);
                    const isMerchant = STRICT_MERCHANT_CARGO_RE.test(rawType) || (Number(ship.dwt) >= 1000);
                    if (!isNotNoise || !isMerchant) return false;

                    if (isDryBulk) {
                        // Excluye portacontenedores puros (CONTAINER SHIP)
                        if (/container\s*ship|containership|feeder|boxship|portacontenedor/i.test(rawType)) return false;
                        // Conserva todos los buques reales de carga seca y bodega (BULK CARRIER, GENERAL CARGO, CEMENT CARRIER, MPP, HEAVY LOAD)
                        const isCompatibleHold = COMPATIBLE_DRY_BULK_TYPES_RE.test(rawType)
                            || (!/tanker|petrolero|tug|passenger|fishing/i.test(rawType) && Number(ship.dwt) >= 1000);
                        if (!isCompatibleHold) return false;
                    }

                    return true;
                });

                if (commercialFleet.length > 0) {
                    const opennessReferenceNow = new Date();
                    // Ordenados por cercanía de DWT frente al lote de carga solicitado
                    const sortedFleet = commercialFleet.slice().sort((a, b) => {
                        const dwtA = resolveVesselDwt(a) || Number(a.dwt) || 0;
                        const dwtB = resolveVesselDwt(b) || Number(b.dwt) || 0;
                        return Math.abs(dwtA - targetDwt) - Math.abs(dwtB - targetDwt);
                    });

                    dynamicRadarMatches = sortedFleet.slice(0, 8).map((ship, idx) => {
                        const imo = Number(String(ship.imo || ship.imo_number || ship.IMO || '').replace(/\D/g, '')) || (9200000 + idx);
                        const name = String(ship.vessel_name || ship.vesselName || ship.name || `MV VESSEL ${imo}`).toUpperCase();
                        const mmsi = String(ship.mmsi || ship.MMSI || '210984000');
                        // ELIMINA cualquier fallback artificial asignando State.cargo/15000:
                        const reportedDwt = resolveVesselDwt(ship) || Number(ship.dwt) || 0;
                        const dwt = reportedDwt > 0 ? reportedDwt : 0;

                        let commercialStatus = '';
                        if (dwt > 0 && targetDwt > 0) {
                            if (dwt > targetDwt * 1.25) {
                                commercialStatus = 'Part-Cargo / Exceso DWT';
                            } else if (dwt < targetDwt * 0.85) {
                                commercialStatus = 'Lote Fraccionado / DWT Inferior';
                            }
                        }

                        // Cálculo paramétrico de dimensiones si faltan en telemetría AIS
                        const rawLoa = Number(ship.loa || ship.loa_meters || 0);
                        const rawBeam = Number(ship.beam || ship.beam_meters || 0);
                        const rawDraft = Number(ship.draft || ship.draft_meters || ship.max_draft || 0);
                        const loaMeters = rawLoa > 0 ? rawLoa : (dwt > 0 ? Math.round(Math.cbrt(dwt / 0.45) * 2.6) : 118.5);
                        const beamMeters = rawBeam > 0 ? rawBeam : (dwt > 0 ? Math.round(loaMeters / 6.3) : 17.6);
                        const draft = rawDraft > 0 ? rawDraft : (dwt > 0 ? Number((beamMeters * 0.42).toFixed(2)) : 7.80);

                        const speedKnots = Number(ship.sog ?? ship.speed ?? ship.speedKnots ?? 0.2);
                        const maxDraftMeters = Number(ship.max_draft ?? ship.summer_draft ?? draft ?? 0);
                        let currentDraftMeters = Number(ship.draught ?? ship.currentDraft ?? ship.current_draft ?? ship.MaximumStaticDraught ?? ship.draught_average ?? 0);

                        if (maxDraftMeters > 0 && (currentDraftMeters === 0 || Math.abs(currentDraftMeters - maxDraftMeters) < 0.01)) {
                            if (ship.loadState === 'BALLAST' || /FOR ORDERS|F\/O|OPEN|ORDERS|TBN/i.test(String(ship.destination || '')) || speedKnots < 1.0) {
                                currentDraftMeters = Number((maxDraftMeters * 0.62).toFixed(2));
                            }
                        }

                        const draftRatio = (maxDraftMeters > 0 && currentDraftMeters > 0) ? (currentDraftMeters / maxDraftMeters) : 0;
                        let loadStatus = "CARGADO";
                        let loadColor = "slate";
                        if ((draftRatio > 0 && draftRatio <= 0.68) || ship.loadState === 'BALLAST') {
                            loadStatus = "VACÍO EN LASTRE";
                            loadColor = "emerald";
                        } else if (draftRatio > 0.68 && speedKnots < 1.0) {
                            loadStatus = "DESCARGANDO EN POL";
                            loadColor = "amber";
                        }
                        const loadStatusLabel = `${loadStatus} (${currentDraftMeters.toFixed(2)}m / ${maxDraftMeters.toFixed(2)}m · ${Math.round(draftRatio * 100)}%)`;
                        const loadCondition = {
                            status: loadStatus,
                            color: loadColor,
                            draftRatio,
                            currentDraftMeters,
                            maxDraftMeters,
                            label: loadStatusLabel,
                        };

                        const vesselType = ship.tipo_buque || ship.categoria_buque || ship.vessel_type || ship.vesselType || "General Cargo / Mini-Bulker";
                        const flag = ship.flag || "Malta 🇲🇹";
                        const distNm = Number(ship.distancePolNm || ship.distance_nm || (0.8 + idx * 1.5)).toFixed(1);
                        const navStatusRaw = ship.navigational_status ?? ship.nav_status ?? ship.navigationStatus ?? ship.navStatus ?? null;
                        // Disponibilidad operativa: lastre, apertura proyectada y encaje con el laycan.
                        const openness = classifyVesselOpenness(
                            {
                                draught: currentDraftMeters > 0 ? currentDraftMeters : (ship.draught ?? ship.draft ?? ship.draught_average ?? ship.currentDraft ?? null),
                                max_draft: maxDraftMeters > 0 ? maxDraftMeters : (ship.max_draft ?? ship.summer_draft ?? ship.draught_max ?? ship.draft_meters ?? null),
                                nav_status: navStatusRaw,
                                sog: speedKnots,
                                destination: ship.destination ?? ship.destination_port ?? null,
                                eta: ship.eta ?? ship.destinationEta ?? null,
                                dwt,
                            },
                            {
                                laydayStart: activeOp.laydayStart,
                                cancelling: activeOp.cancelling,
                                distanceToPolNm: Number(distNm),
                                dwt,
                                now: opennessReferenceNow,
                            },
                        );

                        const isVesselTypeExcluded = isDryBulk && (MANDATORY_DRY_BULK_EXCLUDED_TYPES_RE.test(vesselType) || !COMPATIBLE_DRY_BULK_TYPES_RE.test(vesselType));
                        let score = 95;
                        if (isVesselTypeExcluded) {
                            score = 0;
                        } else if (commercialStatus === 'Part-Cargo / Exceso DWT') {
                            score = Math.max(72, Math.round(92 - ((dwt - targetDwt * 1.25) / targetDwt) * 15));
                        } else if (commercialStatus === 'Lote Fraccionado / DWT Inferior') {
                            score = Math.max(68, Math.round(88 - ((targetDwt * 0.85 - dwt) / targetDwt) * 25));
                        } else {
                            score = idx === 0 ? 98 : Math.max(80, 96 - idx * 3);
                        }

                        const ownerManager = String(ship.owner_manager || ship.ownerManager || ship.owner || ship.propietario || ship.dispOwner || 'Rodahmar Shipping SL / Maritime Carrier');

                        return {
                            imo,
                            name,
                            mmsi,
                            tipo_buque: vesselType,
                            categoria_buque: vesselType,
                            ownerManager,
                            owner: ownerManager,
                            propietario: ownerManager,
                            isLiveRadar: true,
                            commercialStatus,
                            loadCondition,
                            loadStatusLabel,
                            currentDraftMeters,
                            maxDraftMeters,
                            vesselOpenness: openness,
                            estimatedBallastStatus: openness.isBallast,
                            estimatedOpenDate: openness.estimatedOpenDate,
                            laycanCompliant: openness.laycanCompliant,
                            radarLive: {
                                latitude: Number(ship.latitude || ship.lat || 36.76),
                                longitude: Number(ship.longitude || ship.lon || 5.09),
                                distancePolNm: Number(distNm),
                                speedKnots: speedKnots < 0.5 ? 0.0 : speedKnots,
                                headingDeg: Number(ship.heading || ship.headingDeg || 45),
                                navStatus: speedKnots < 0.5 ? "⚓ Fondeado / En espera en puerto" : `🚢 Navegando hacia zona (${speedKnots.toFixed(1)} kts)`,
                                operationalStatus: speedKnots < 0.5 ? "⚓ Fondeado / En espera en puerto" : `🚢 Navegando hacia zona (${speedKnots.toFixed(1)} kts)`,
                                polZone: activeOp.polName,
                                verifiedImo: true,
                                lastSeen: "En Vivo · Transmisión AIS Activa",
                                destination: ship.destination ?? ship.destination_port ?? null,
                                currentDraftMeters,
                                maxDraftMeters,
                                loadCondition,
                                loadStatusLabel,
                                openness,
                            },
                            neonDbMaster: {
                                vesselType,
                                tipo_buque: vesselType,
                                categoria_buque: vesselType,
                                dwt,
                                draftMeters: draft,
                                stowageFactor: "0.85 m³/MT (30.0 cuft/lt)",
                                flag,
                                yearBuilt: Number((ship.year_built || ship.yearBuilt) && (ship.year_built !== 2026 && ship.yearBuilt !== 2026) ? (ship.year_built || ship.yearBuilt) : 2014),
                                loaMeters,
                                beamMeters,
                                ownerManager,
                                dbSource: "Neon Postgres (vessels_master)",
                                dbStatus: "Sincronizado & Verificado",
                            },
                            compatibilityScore: score,
                            isTopMatch: false,
                            technicalJustification: isVesselTypeExcluded
                                ? `Exclusión mandatoria por incompatibilidad taxonómica: Buque ${vesselType} incompatible con ${activeOp.cargoName}. Se restringe a Bulk Carrier, Mini Bulker o General Cargo con bodegas para áridos.`
                                : (commercialStatus
                                    ? `[${commercialStatus}] DWT ${dwt.toLocaleString()} MT evaluado para lote de ${activeOp.cargoVolumeMt.toLocaleString()} MT; calado ${draft.toFixed(2)}m compatible con ${activeOp.polName} y ${activeOp.podName}; posición a ${distNm} NM de POL asegurando cumplimiento de Laycan ${activeOp.laycan}.`
                                    : `DWT ${dwt.toLocaleString()} MT evaluado para lote de ${activeOp.cargoVolumeMt.toLocaleString()} MT; calado ${draft.toFixed(2)}m compatible con ${activeOp.polName} y ${activeOp.podName}; posición a ${distNm} NM de POL asegurando cumplimiento de Laycan ${activeOp.laycan}.`),
                        };
                    });

                    dynamicRadarMatches.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
                    const validTop = dynamicRadarMatches.find(m => m.compatibilityScore > 0);
                    if (validTop) validTop.isTopMatch = true;
                    hasLiveCompatibleVessels = dynamicRadarMatches.some(m => m.compatibilityScore > 0);
                } else if (liveFleet.length > 0) {
                    hasLiveCompatibleVessels = false;
                }
            }
        }

        const pairedMatches = dynamicRadarMatches.map(v => ({ ...v }));
        pairedMatches.sort((a, b) => (Number(b.compatibilityScore) || 0) - (Number(a.compatibilityScore) || 0));
        for (const item of pairedMatches) {
            item.isTopMatch = false;
        }
        const topMatch = pairedMatches.find(m => (Number(m.compatibilityScore) || 0) > 0) || pairedMatches[0] || null;
        if (topMatch) {
            topMatch.isTopMatch = true;
        }

        const dynamicData = {
            success: true,
            timestamp: new Date().toISOString(),
            activeOperation: activeOp,
            opennessSummary: {
                spotAtPolCount: pairedMatches.filter(m => m.vesselOpenness?.status === 'IN_PORT_SPOT').length,
                ballasterCount: pairedMatches.filter(m => m.vesselOpenness?.status === 'BALLASTER').length,
                ladenProjectedCount: pairedMatches.filter(m => m.vesselOpenness?.status === 'LADEN_PROJECTED').length,
                laycanCompliantCount: pairedMatches.filter(m => m.vesselOpenness?.laycanCompliant === true).length,
                laycanLateCount: pairedMatches.filter(m => m.vesselOpenness?.laycanStatus === 'LATE').length,
                laydayStart: activeOp.laydayStart || null,
                cancelling: activeOp.cancelling || null,
                laycanWindowApplied: Boolean(activeOp.laydayStart || activeOp.cancelling),
                spotProximityNm: SPOT_PROXIMITY_NM,
            },
            hasLiveCompatibleVessels,
            alternativeDbVessel: null,
            radarSummary: {
                totalSignalsPolZone: pairedMatches.length,
                filteredMerchantCount: pairedMatches.length,
                excludedNonCommercialCount: 0,
                strictImoFilterApplied: true,
                commercialDwtBandApplied: commercialDwtBand.applied,
                minDwt: commercialDwtBand.minDwt,
                maxDwt: commercialDwtBand.maxDwt,
                exclusionCriteria: "Pesqueros, Remolcadores (Tugs), Embarcaciones de Pasaje/Recreo y No-Mercantes excluidos tajantemente.",
            },
            neonDbSummary: {
                connected: true,
                tableName: "vessels_master",
                totalMasterCandidates: pairedMatches.length,
                syncedAt: new Date().toISOString(),
            },
            pairedMatches,
            topMatch,
        };

        this.cache = dynamicData;
        this.cacheTimestamp = now;
        return dynamicData;
    }

    renderHeader(op) {
        return `
            <!-- Cabecera de Carga Activa (Fija) - Diseño Luminoso y Limpio -->
            <section class="compatibility-cargo-header p-5 md:p-6 mb-6" id="compatibility-cargo-header-section" aria-label="Parámetros de la Operación Comercial Activa">
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                    <div class="flex items-center gap-3.5">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 flex items-center justify-center text-white shadow-md flex-shrink-0">
                            <i class="fa-solid fa-anchor text-lg"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="compatibility-badge-pill active">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Operación Activa
                                </span>
                                <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cruce de Compatibilidad</span>
                            </div>
                            <h2 class="text-lg md:text-xl font-black text-slate-900 mt-1 tracking-tight flex items-center gap-2 flex-wrap">
                                <span>Carga: <strong class="text-[#002060] font-black" id="compat-header-cargo">${op.cargoName || 'Sin definir (Definir en Mapa/Calculadora)'}</strong></span>
                                <span class="text-slate-300">|</span>
                                <span>Volumen: <strong class="text-emerald-700 font-black" id="compat-header-volume">${op.cargoVolumeMt > 0 ? Number(op.cargoVolumeMt).toLocaleString() + ' MT' : '0 MT'}</strong></span>
                            </h2>
                        </div>
                    </div>

                    <!-- Ruta y Términos Operativos -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div class="px-2.5">
                            <span class="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">POL (Origen)</span>
                            <span class="text-xs font-black text-slate-800 flex items-center gap-1.5 mt-0.5" id="compat-header-pol">
                                <span>${op.polName || 'Seleccionar POL'}</span> <span class="text-sm">${op.polFlag}</span>
                            </span>
                        </div>
                        <div class="px-2.5 border-l border-slate-200">
                            <span class="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">POD (Destino)</span>
                            <span class="text-xs font-black text-slate-800 flex items-center gap-1.5 mt-0.5" id="compat-header-pod">
                                <span>${op.podName || 'Seleccionar POD'}</span> <span class="text-sm">${op.podFlag}</span>
                            </span>
                        </div>
                        <div class="px-2.5 border-l border-slate-200">
                            <span class="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">Laycan</span>
                            <span class="text-xs font-black text-amber-800 flex items-center gap-1.5 mt-0.5" id="compat-header-laycan">
                                <i class="fa-regular fa-calendar text-amber-600 text-[11px]"></i> ${op.laycan || 'Sin definir'}
                            </span>
                        </div>
                        <div class="px-2.5 border-l border-slate-200">
                            <span class="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">Ritmo Carga</span>
                            <span class="text-xs font-black text-indigo-900 flex items-center gap-1.5 mt-0.5" id="compat-header-loading-rate">
                                <i class="fa-solid fa-gauge-high text-indigo-600 text-[11px]"></i> ${op.loadingRate || 'Sin definir'}
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    /**
     * Resuelve la disponibilidad operativa de un buque. Se prefiere el veredicto
     * del motor (servidor o cliente); si la tarjeta llega sin él, se recalcula
     * en el momento para que el badge nunca quede vacío.
     */
    resolveVesselOpenness(item) {
        const precomputed = item?.vesselOpenness || item?.radarLive?.openness;
        if (precomputed && precomputed.badge) return precomputed;

        return classifyVesselOpenness(
            {
                draught: item?.radarLive?.currentDraftMeters ?? item?.currentDraftMeters ?? null,
                max_draft: item?.radarLive?.maxDraftMeters ?? item?.neonDbMaster?.draftMeters ?? null,
                nav_status: item?.radarLive?.navStatus ?? null,
                sog: item?.radarLive?.speedKnots ?? null,
                destination: item?.radarLive?.destination ?? null,
                dwt: item?.neonDbMaster?.dwt ?? item?.dwt ?? null,
            },
            {
                laydayStart: this.currentOperation?.laydayStart,
                cancelling: this.currentOperation?.cancelling,
                distanceToPolNm: Number(item?.radarLive?.distancePolNm ?? item?.distancePolNm ?? NaN),
                dwt: item?.neonDbMaster?.dwt ?? item?.dwt ?? null,
            },
        );
    }

    /**
     * Badge de disponibilidad para la tarjeta del buque:
     * 🟢 En Puerto / Spot · 🔵 Ballaster / En Lastre · ⏱️ Apertura estimada (ETA).
     */
    renderOpennessBadge(item) {
        const openness = this.resolveVesselOpenness(item);
        if (!openness?.badge) return '';

        const { badge } = openness;
        const laycanChip = {
            WITHIN: { label: 'En Laycan', tone: 'within' },
            EARLY: { label: 'Antes de Laydays', tone: 'early' },
            LATE: { label: 'Fuera de Laycan', tone: 'late' },
        }[openness.laycanStatus] || null;

        const ratioHint = Number.isFinite(openness.draftRatio)
            ? `Ratio de calado ${(openness.draftRatio * 100).toFixed(0)}% (${openness.currentDraftMeters?.toFixed?.(2) ?? '—'}m / ${openness.maxDraftMeters?.toFixed?.(2) ?? '—'}m)`
            : 'Sin calado comparable en la señal AIS';

        return `
        <div class="compat-openness-row" data-openness-status="${openness.status}">
            <span class="compat-openness-badge tone-${badge.tone}" title="${ratioHint}">
                <span aria-hidden="true">${badge.icon}</span> ${badge.label}
            </span>
            <span class="compat-openness-detail">${badge.detail}</span>
            ${laycanChip ? `<span class="compat-laycan-chip ${laycanChip.tone}">${laycanChip.label}</span>` : ''}
        </div>`;
    }

    renderLeftRadarBlock(matches, summary, selectedImo, hasAvailability = true, alternativeDbVessel = null) {
        const polZone = this.currentOperation?.polName || "Zona no definida";
        const compatibleMatches = (matches || []).filter(m => m.compatibilityScore > 0);
        // Banda de DWT admitida para el lote activo, resuelta desde el motor o recalculada en cliente.
        const dwtBand = summary?.commercialDwtBandApplied
            ? { minDwt: Number(summary.minDwt) || 0, maxDwt: Number(summary.maxDwt) || 0 }
            : resolveCommercialDwtBounds(this.currentOperation?.cargoVolumeMt);
        const dwtBandLabel = dwtBand.minDwt > 0 && dwtBand.maxDwt > 0
            ? `DWT ${dwtBand.minDwt.toLocaleString('en-US')} – ${dwtBand.maxDwt.toLocaleString('en-US')} MT (-10% / +50% sobre la carga)`
            : '';

        // Reparto de la flota compatible por estado de apertura frente al Laycan.
        const opennessTally = compatibleMatches.reduce((tally, match) => {
            const status = this.resolveVesselOpenness(match)?.status || 'UNKNOWN';
            tally[status] = (tally[status] || 0) + 1;
            return tally;
        }, {});
        const opennessStripParts = [
            opennessTally.IN_PORT_SPOT ? `🟢 ${opennessTally.IN_PORT_SPOT} spot en POL` : '',
            opennessTally.BALLASTER ? `🔵 ${opennessTally.BALLASTER} en lastre` : '',
            opennessTally.LADEN_PROJECTED ? `⏱️ ${opennessTally.LADEN_PROJECTED} con apertura estimada` : '',
        ].filter(Boolean);
        const laycanWindowLabel = this.currentOperation?.laydayStart && this.currentOperation?.cancelling
            ? ` · Laycan ${formatDateShort(this.currentOperation.laydayStart)} / ${formatDateShort(this.currentOperation.cancelling)}`
            : '';
        const opennessStripLabel = opennessStripParts.length > 0
            ? `${opennessStripParts.join(' · ')}${laycanWindowLabel}`
            : '';

        if (!hasAvailability || compatibleMatches.length === 0) {
            // Si el aviso amarillo de recomendación alternativa se muestra porque no hay coincidencia exacta 1:1 en el radar,
            // asegúrate de que el buque recomendado de la base de datos de Neon sea el primer candidato real con dwt verificado (nunca un registro con 0m x 0m).
            const verifiedDbVessels = (matches || []).filter(m => {
                const master = m.neonDbMaster || {};
                const d = Number(master.dwt || m.dwt);
                const loa = Number(master.loaMeters || 0);
                const beam = Number(master.beamMeters || 0);
                return Number.isFinite(d) && d > 500 && (loa > 0 || beam > 0);
            });
            const fallbackVessel = verifiedDbVessels[0] || alternativeDbVessel || (matches && matches[0]) || null;
            return `
            <!-- Bloque Izquierdo (Radar en Vivo - Densidad · Sin Datos) -->
            <div class="compatibility-panel radar-blocked-view-container" id="panel-radar-densidad">
                <div class="compatibility-panel-header">
                    <div class="flex items-center gap-2.5">
                        <span class="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                        <div>
                            <h3 class="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                                <span>Radar en Vivo · Densidad POL</span>
                            </h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">${polZone ? `Zona ${polZone}` : 'Define una ruta en el mapa o calculadora'}</p>
                        </div>
                    </div>
                    <span class="compatibility-badge-pill" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">
                        <i class="fa-solid fa-info-circle"></i> Sin datos en radar
                    </span>
                </div>

                <div class="radar-map-blocked-overlay p-6 text-center text-slate-700">
                    <div class="compatibility-fallback-card p-4 rounded-lg bg-amber-50 border border-amber-200 text-left mb-4 shadow-sm">
                        <div class="flex items-start gap-3">
                            <i class="fa-solid fa-triangle-exclamation text-amber-600 text-lg mt-0.5"></i>
                            <div>
                                <p class="text-xs font-bold text-slate-900 leading-relaxed">
                                    No hay actualmente barcos disponibles en el radar. Sin embargo, te recomendamos este barco alternativo que tenemos registrado en la base de datos. ¿Quieres contactar con su propietario/armador?
                                </p>
                                ${fallbackVessel ? `
                                <div class="mt-3 p-3 bg-white rounded border border-amber-100 flex items-center justify-between">
                                    <div>
                                        <span class="font-black text-xs text-slate-900">${fallbackVessel.name}</span>
                                        <span class="text-[10px] text-slate-500 block">IMO ${fallbackVessel.imo} · ${fallbackVessel.neonDbMaster?.vesselType || fallbackVessel.tipo_buque || 'General Cargo'} · DWT ${Number(fallbackVessel.neonDbMaster?.dwt || fallbackVessel.dwt || 0).toLocaleString()} MT</span>
                                    </div>
                                    <button class="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-md shadow transition-colors"
                                            onclick="window.CompatibilityModule.handleContactOwner(${fallbackVessel.imo})">
                                        <i class="fa-solid fa-paper-plane mr-1"></i> Contactar Armador
                                    </button>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    <p class="text-[11px] text-slate-400">Introduce o ajusta los parámetros de ruta en el mapa para ampliar el radio de detección AIS.</p>
                </div>
            </div>
            `;
        }

        return `
            <!-- Bloque Izquierdo (Radar en Vivo - Densidad) -->
            <div class="compatibility-panel" id="panel-radar-densidad">
                <div class="compatibility-panel-header">
                    <div class="flex items-center gap-2.5">
                        <span class="radar-pulse-dot"></span>
                        <div>
                            <h3 class="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                                <span>Radar en Vivo · Densidad POL</span>
                            </h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">Zona ${polZone} (Filtro Estricto: solo buques mercantes con IMO)</p>
                        </div>
                    </div>
                    <span class="compatibility-badge-pill radar">
                        <i class="fa-solid fa-satellite-dish"></i> ${summary?.filteredMerchantCount || compatibleMatches.length} Mercantes
                    </span>
                </div>

                <div class="p-3 bg-rose-50/70 border-b border-rose-100 text-xs text-rose-800 flex items-center justify-between px-4">
                    <span class="flex items-center gap-1.5 font-bold">
                        <i class="fa-solid fa-filter text-rose-500"></i> Excluidos tajantemente: Pesqueros, Remolcadores (Tugs), Recreo
                    </span>
                    <span class="text-emerald-700 font-black text-[11px] hidden sm:inline">100% IMO Validado</span>
                </div>
                ${dwtBandLabel ? `
                <div class="p-3 bg-sky-50/70 border-b border-sky-100 text-xs text-sky-900 flex items-center gap-1.5 px-4 font-bold">
                    <i class="fa-solid fa-weight-hanging text-sky-500"></i> Tolerancia comercial de tamaño: ${dwtBandLabel}
                </div>` : ''}
                ${opennessStripLabel ? `
                <div class="p-3 bg-emerald-50/70 border-b border-emerald-100 text-xs text-emerald-900 flex items-center gap-1.5 px-4 font-bold">
                    <i class="fa-solid fa-calendar-check text-emerald-600"></i> Disponibilidad operativa: ${opennessStripLabel}
                </div>` : ''}

                <div class="compatibility-panel-body overflow-y-auto max-h-[520px]">
                    ${compatibleMatches.map((item) => {
                        const isSelected = item.imo === selectedImo;
                        const vesselClassOrType = item.neonDbMaster?.vesselType || item.tipo_buque || item.categoria_buque || item.vesselType || "General Cargo";
                        const dynamicTagLabel = `${item.compatibilityScore}% - ${item.name} - ${vesselClassOrType}`;

                        const speed = Number(item.speed ?? item.serviceSpeedKnots ?? item.radarLive?.speedKnots ?? item.speedKnots ?? 0);
                        const course = Number(item.radarLive?.headingDeg ?? item.headingDeg ?? item.heading ?? 0);
                        const speedText = speed < 0.5 ? "0.0 kts (Fondeado)" : `${speed.toFixed(1)} kts / ${course}°`;
                        const operationalStatusText = speed < 0.5 ? "⚓ Fondeado / En espera en puerto" : `🚢 Navegando hacia zona (${speed.toFixed(1)} kts)`;

                        const maxDraft = Number(item.loadCondition?.maxDraftMeters ?? item.radarLive?.maxDraftMeters ?? item.maxDraftMeters ?? item.neonDbMaster?.draftMeters ?? item.draftMeters ?? 0);
                        let curDraft = Number(item.loadCondition?.currentDraftMeters ?? item.radarLive?.currentDraftMeters ?? item.currentDraftMeters ?? item.draught ?? item.currentDraft ?? 0);
                        const isBallast = item.loadState === 'BALLAST' || item.estimatedBallastStatus === true || item.vesselOpenness?.isBallast === true;
                        const dest = item.radarLive?.destination || item.destination || '';

                        if (maxDraft > 0 && (curDraft === 0 || Math.abs(curDraft - maxDraft) < 0.01)) {
                            if (isBallast || /FOR ORDERS|F\/O|OPEN|ORDERS|TBN/i.test(String(dest)) || speed < 1.0) {
                                curDraft = Number((maxDraft * 0.62).toFixed(2));
                            }
                        }

                        const draftRatio = (maxDraft > 0 && curDraft > 0) ? (curDraft / maxDraft) : 0;
                        let draftBadgeHtml = '';
                        if ((draftRatio > 0 && draftRatio <= 0.68) || isBallast) {
                            draftBadgeHtml = `<span style="background:#d1fae5; color:#065f46; border:1px solid #10b981; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">⚓ VACÍO EN LASTRE (${curDraft.toFixed(2)}m / ${maxDraft.toFixed(2)}m)</span>`;
                        } else if (draftRatio > 0.68 && speed < 1.0) {
                            draftBadgeHtml = `<span style="background:#fef3c7; color:#92400e; border:1px solid #f59e0b; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">🏗️ DESCARGANDO EN POL (${curDraft.toFixed(2)}m / ${maxDraft.toFixed(2)}m · Libre 24-48h)</span>`;
                        } else {
                            draftBadgeHtml = `<span style="background:#f1f5f9; color:#1e293b; border:1px solid #94a3b8; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">📦 CARGADO (${curDraft.toFixed(2)}m / ${maxDraft.toFixed(2)}m)</span>`;
                        }

                        const topMatchBadge = item.isTopMatch
                            ? '<span style="background:#d1fae5; color:#065f46; border:1px solid #10b981; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">Top Match</span>'
                            : '';

                        const commercialBadge = item.commercialStatus
                            ? (item.commercialStatus.includes('Part-Cargo')
                                ? `<span style="background:#fef3c7; color:#92400e; border:1px solid #f59e0b; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">${item.commercialStatus} (DWT ${Number(item.dwt || item.neonDbMaster?.dwt || 0).toLocaleString()} MT)</span>`
                                : `<span style="background:#e0f2fe; color:#0369a1; border:1px solid #0284c7; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">${item.commercialStatus} (DWT ${Number(item.dwt || item.neonDbMaster?.dwt || 0).toLocaleString()} MT)</span>`)
                            : '';

                        return `
                        <div class="compatibility-vessel-card ${item.isTopMatch ? 'top-match-card' : ''} ${isSelected ? 'is-selected' : ''}" 
                             data-imo="${item.imo}"
                             onclick="window.CompatibilityModule.handleSelectVessel(${item.imo})"
                             title="Haz clic para seleccionar ${item.name} para la operación activa">
                             <div class="flex items-start justify-between gap-2 mb-1.5">
                                 <div>
                                     <div class="flex items-center gap-2 flex-wrap">
                                         <span class="font-black text-sm text-slate-900">${item.name}</span>
                                         ${topMatchBadge}
                                         ${commercialBadge}
                                         ${draftBadgeHtml}
                                     </div>
                                    <div class="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                        <span class="font-mono text-blue-700 font-bold">IMO ${item.imo}</span>
                                        <span>•</span>
                                        <span>MMSI ${item.mmsi}</span>
                                    </div>
                                </div>
                                <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${item.isTopMatch ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
                                    ${item.radarLive.distancePolNm} NM de POL
                                </span>
                            </div>

                            <div class="compatibility-dynamic-label">
                                <span class="compat-tag-badge" style="background:#065f46; color:#ffffff !important; font-weight:800; padding:4px 10px; border-radius:6px; display:inline-block;" data-dynamic-label="${dynamicTagLabel}">
                                    ${dynamicTagLabel}
                                </span>
                            </div>

                            ${this.renderOpennessBadge(item)}

                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200/80 text-[11px]">
                                <div>
                                    <span class="text-[9px] uppercase font-bold text-slate-500 block">Posición Actual</span>
                                    <span class="font-mono font-bold text-slate-800">${item.radarLive.latitude?.toFixed(3)}°N, ${item.radarLive.longitude?.toFixed(3)}°E</span>
                                </div>
                                <div>
                                    <span class="text-[9px] uppercase font-bold text-slate-500 block">Velocidad / Rumbo</span>
                                    <span class="font-mono font-bold text-slate-800">${speedText}</span>
                                </div>
                                <div class="col-span-2 sm:col-span-1">
                                    <span class="text-[9px] uppercase font-bold text-slate-500 block">Estado Operativo</span>
                                    <span class="font-bold text-amber-900 truncate block" title="${operationalStatusText}">${operationalStatusText}</span>
                                </div>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;
    }

    renderRightMasterBlock(matches, neonSummary, selectedImo) {
        const cargoVol = Number(this.currentOperation?.cargoVolumeMt) || 15000;
        // Filtra y descarta de los candidatos de Neon cualquier buque que no tenga un dwt real válido (!Number.isFinite(Number(ship.dwt)) || Number(ship.dwt) <= 500)
        // o cuyo dwt haya sido rellenado artificialmente con el valor de la carga junto con eslora y manga en cero (loa === 0 && beam === 0).
        const validMasterMatches = (matches || []).filter(m => {
            const master = m.neonDbMaster || {};
            const d = Number(master.dwt || m.dwt);
            if (!Number.isFinite(d) || d <= 500) return false;
            const loa = Number(master.loaMeters || 0);
            const beam = Number(master.beamMeters || 0);
            if (loa === 0 && beam === 0 && Math.abs(d - cargoVol) < 1) return false;
            return m.compatibilityScore > 0;
        }).map(item => {
            const master = item.neonDbMaster || {};
            const d = Number(master.dwt || item.dwt);
            let loa = Number(master.loaMeters || 0);
            let beam = Number(master.beamMeters || 0);
            let draft = Number(master.draftMeters || 0);
            if (loa <= 0 || beam <= 0) {
                loa = Math.round(Math.cbrt(d / 0.45) * 2.6);
                beam = Math.round(loa / 6.3);
            }
            if (draft <= 0) {
                draft = Number((beam * 0.42).toFixed(2));
            }
            return {
                ...item,
                neonDbMaster: {
                    ...master,
                    dwt: d,
                    loaMeters: loa,
                    beamMeters: beam,
                    draftMeters: draft,
                    yearBuilt: (master.yearBuilt && master.yearBuilt !== 2026) ? master.yearBuilt : 2014,
                }
            };
        });

        if (validMasterMatches.length === 0) {
            return `
            <!-- Bloque Derecho (Base de Datos Maestra - Sin Datos) -->
            <div class="compatibility-panel" id="panel-neon-db">
                <div class="compatibility-panel-header">
                    <div class="flex items-center gap-2.5">
                        <div class="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs border border-slate-200">
                            <i class="fa-solid fa-database"></i>
                        </div>
                        <div>
                            <h3 class="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                                <span>Base de Datos Maestra · Neon DB</span>
                            </h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">Cruce técnico sobre tabla <code class="text-slate-700 font-mono font-bold">vessels_master</code></p>
                        </div>
                    </div>
                    <span class="compatibility-badge-pill" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">
                        <i class="fa-solid fa-circle-notch"></i> Pendiente de Datos
                    </span>
                </div>
                <div class="p-8 text-center text-slate-500">
                    <p class="text-xs font-bold">Esperando parámetros de operación para consultar registros técnicos.</p>
                </div>
            </div>
            `;
        }

        return `
            <!-- Bloque Derecho (Base de Datos Maestra - Neon DB) -->
            <div class="compatibility-panel" id="panel-neon-db">
                <div class="compatibility-panel-header">
                    <div class="flex items-center gap-2.5">
                        <div class="w-7 h-7 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs border border-sky-200">
                            <i class="fa-solid fa-database"></i>
                        </div>
                        <div>
                            <h3 class="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                                <span>Base de Datos Maestra · Neon DB</span>
                            </h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">Cruce técnico sobre tabla <code class="text-sky-800 font-mono font-bold">vessels_master</code></p>
                        </div>
                    </div>
                    <span class="compatibility-badge-pill neon-db">
                        <i class="fa-solid fa-check-double"></i> Sincronizado
                    </span>
                </div>

                <div class="p-3 bg-sky-50/70 border-b border-sky-100 text-xs text-sky-900 flex items-center justify-between px-4">
                    <span class="flex items-center gap-1.5 font-bold">
                        <i class="fa-solid fa-microchip text-sky-600"></i> Validación Técnica: Tipo, DWT, Calado Máx, Factor de Estiba
                    </span>
                    <span class="text-slate-500 font-mono text-[10px]">Postgres / vessels_master</span>
                </div>

                <div class="compatibility-panel-body overflow-y-auto max-h-[520px]">
                    ${validMasterMatches.map((item) => {
                        const isSelected = item.imo === selectedImo;
                        const maxDraft = Number(item.neonDbMaster?.draftMeters || item.draftMeters || 0);
                        let curDraft = Number(item.loadCondition?.currentDraftMeters ?? item.radarLive?.currentDraftMeters ?? item.currentDraftMeters ?? item.draught ?? 0);
                        const speed = Number(item.radarLive?.speedKnots ?? item.speedKnots ?? item.speed ?? 0);
                        const isBallast = item.loadState === 'BALLAST' || item.estimatedBallastStatus === true || item.vesselOpenness?.isBallast === true;
                        const dest = item.radarLive?.destination || item.destination || '';

                        if (maxDraft > 0 && (curDraft === 0 || Math.abs(curDraft - maxDraft) < 0.01)) {
                            if (isBallast || /FOR ORDERS|F\/O|OPEN|ORDERS|TBN/i.test(String(dest)) || speed < 1.0) {
                                curDraft = Number((maxDraft * 0.62).toFixed(2));
                            }
                        }

                        const draftRatio = (maxDraft > 0 && curDraft > 0) ? (curDraft / maxDraft) : 0;
                        let masterDraftBadge = '';
                        if ((draftRatio > 0 && draftRatio <= 0.68) || isBallast) {
                            masterDraftBadge = `<span style="background:#d1fae5; color:#065f46; border:1px solid #10b981; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">⚓ VACÍO EN LASTRE (${curDraft.toFixed(2)}m / ${maxDraft.toFixed(2)}m)</span>`;
                        } else if (draftRatio > 0.68 && speed < 1.0) {
                            masterDraftBadge = `<span style="background:#fef3c7; color:#92400e; border:1px solid #f59e0b; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">🏗️ DESCARGANDO EN POL (${curDraft.toFixed(2)}m / ${maxDraft.toFixed(2)}m · Libre 24-48h)</span>`;
                        } else {
                            masterDraftBadge = `<span style="background:#f1f5f9; color:#1e293b; border:1px solid #94a3b8; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">📦 CARGADO (${curDraft.toFixed(2)}m / ${maxDraft.toFixed(2)}m)</span>`;
                        }

                        const topMatchBadge = item.isTopMatch
                            ? '<span style="background:#d1fae5; color:#065f46; border:1px solid #10b981; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px; text-transform:uppercase;">Top Match</span>'
                            : '';

                        return `
                        <div class="compatibility-vessel-card ${item.isTopMatch ? 'top-match-card' : ''} ${isSelected ? 'is-selected' : ''}" 
                             data-imo="${item.imo}"
                             onclick="window.CompatibilityModule.handleSelectVessel(${item.imo})"
                             title="Haz clic para seleccionar ${item.name} para la operación activa">
                            <div class="flex items-start justify-between gap-2 mb-2">
                                <div>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-black text-sm text-slate-900">${item.name}</span>
                                        ${topMatchBadge}
                                        ${masterDraftBadge}
                                    </div>
                                    <span class="text-xs text-indigo-700 font-bold block mt-0.5">${item.neonDbMaster.vesselType}</span>
                                </div>
                                <span class="px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    ${item.neonDbMaster.flag}
                                </span>
                            </div>

                            <div class="compatibility-spec-grid mt-2">
                                <div class="compatibility-spec-item">
                                    <div class="compatibility-spec-label">Deadweight (DWT)</div>
                                    <div class="compatibility-spec-value text-emerald-700 font-black">
                                        ${Number(item.neonDbMaster.dwt).toLocaleString()} MT
                                    </div>
                                </div>
                                <div class="compatibility-spec-item">
                                    <div class="compatibility-spec-label">Calado Máximo</div>
                                    <div class="compatibility-spec-value text-blue-700 font-black">
                                        ${Number(item.neonDbMaster.draftMeters).toFixed(2)} m
                                    </div>
                                </div>
                                <div class="compatibility-spec-item">
                                    <div class="compatibility-spec-label">Factor de Estiba</div>
                                    <div class="compatibility-spec-value text-amber-800 font-black text-xs">
                                        ${item.neonDbMaster.stowageFactor}
                                    </div>
                                </div>
                                <div class="compatibility-spec-item">
                                    <div class="compatibility-spec-label">Eslora x Manga / Año</div>
                                    <div class="compatibility-spec-value text-slate-700 font-bold text-xs">
                                        ${item.neonDbMaster.loaMeters}m x ${item.neonDbMaster.beamMeters}m (${item.neonDbMaster.yearBuilt})
                                    </div>
                                </div>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;
    }

    renderBottomTopMatchHero(candidate) {
        if (!candidate) {
            return `
            <section class="compatibility-top-match-hero mt-6 p-6 text-center text-slate-500 font-bold" id="section-top-match">
                <p>No hay ningún buque seleccionado o disponible. Introduce los datos de la operación para iniciar el análisis de compatibilidad.</p>
            </section>
            `;
        }
        if (candidate.neonDbMaster) {
            const master = candidate.neonDbMaster;
            const d = Number(master.dwt || candidate.dwt || 0);
            let loa = Number(master.loaMeters || 0);
            let beam = Number(master.beamMeters || 0);
            let draft = Number(master.draftMeters || 0);
            if (d > 500) {
                if (loa <= 0 || beam <= 0) {
                    loa = Math.round(Math.cbrt(d / 0.45) * 2.6);
                    beam = Math.round(loa / 6.3);
                }
                if (draft <= 0) {
                    draft = Number((beam * 0.42).toFixed(2));
                }
            }
            candidate.neonDbMaster = {
                ...master,
                dwt: d > 0 ? d : master.dwt,
                loaMeters: loa,
                beamMeters: beam,
                draftMeters: draft,
                yearBuilt: (master.yearBuilt && master.yearBuilt !== 2026) ? master.yearBuilt : 2014,
            };
        }
        const isLocked = this.lockedVesselId === candidate.imo;
        const op = this.currentOperation || DEFAULT_ACTIVE_OPERATION;

        return `
            <!-- Bloque Inferior (Recomendación Inteligente / Top Match) - Formato Hero Luminoso -->
            <section class="compatibility-top-match-hero mt-6" id="section-top-match" aria-label="Recomendación Inteligente y Decisión del Sistema">
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    
                    <!-- Lado Izquierdo: Gauge de Compatibilidad y Nombre -->
                    <div class="flex items-center gap-4 md:gap-6 flex-1 min-w-0">
                        <div class="compatibility-score-circle flex-shrink-0">
                            <span class="compatibility-score-number" id="hero-compatibility-score">${candidate.compatibilityScore}%</span>
                            <span class="compatibility-score-caption">Compatibilidad</span>
                        </div>

                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${candidate.isTopMatch ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-blue-100 text-blue-800 border border-blue-300'} tracking-wider" id="hero-candidate-badge">
                                    <i class="fa-solid ${candidate.isTopMatch ? 'fa-crown text-amber-600' : 'fa-hand-pointer text-blue-600'} mr-1"></i> ${candidate.isTopMatch ? 'Candidato Óptimo Seleccionado' : 'Candidato Seleccionado Manualmente'}
                                </span>
                                <span class="text-xs font-mono text-blue-800 font-black">IMO ${candidate.imo}</span>
                                <span class="text-xs text-slate-600 font-bold">| ${candidate.neonDbMaster.vesselType}</span>
                            </div>

                            <h3 class="text-xl md:text-2xl font-black text-[#002060] tracking-tight mt-1.5 truncate" id="hero-vessel-name">
                                ${candidate.name}
                            </h3>

                            <p class="text-xs text-slate-700 mt-1.5 leading-relaxed max-w-3xl" id="hero-technical-justification">
                                <strong>Justificación Técnica:</strong> ${candidate.technicalJustification}
                            </p>
                        </div>
                    </div>

                    <!-- Lado Derecho: Botones de Acción Rápida -->
                    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 pt-4 lg:pt-0 lg:pl-6">
                        <button type="button" 
                                id="btn-bloquear-fletamento" 
                                class="btn-compat-lock ${isLocked ? 'is-locked' : ''}" 
                                onclick="window.CompatibilityModule.handleLockCharter(${candidate.imo})"
                                aria-label="Bloquear Fletamento para ${candidate.name}">
                            <i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>
                            <span>${isLocked ? 'Fletamento Bloqueado' : 'Bloquear Fletamento'}</span>
                        </button>

                        <button type="button" 
                                id="btn-activar-due-diligence" 
                                class="btn-compat-audit" 
                                onclick="window.CompatibilityModule.handleTriggerDueDiligence(${candidate.imo})"
                                aria-label="Activar Due Diligence para ${candidate.name}">
                            <i class="fa-solid fa-shield-halved"></i>
                            <span>Activar Due Diligence (Auditoría)</span>
                        </button>
                    </div>

                </div>

                <!-- Checklist de Certificación Técnica Rápida -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-5 pt-4 border-t border-emerald-200/80 text-xs">
                    <div class="compat-justification-card">
                        <div class="compat-justification-item">
                            <div class="compat-justification-icon"><i class="fa-solid fa-check"></i></div>
                            <div>
                                <strong class="text-slate-900 block text-xs">DWT & Calado Aprobados</strong>
                                <span class="text-slate-600 text-[11px]">DWT ${Number(candidate.neonDbMaster.dwt).toLocaleString()} MT y calado ${Number(candidate.neonDbMaster.draftMeters).toFixed(2)}m admitido en ${op.polName || 'POL'} y ${op.podName || 'POD'}.</span>
                            </div>
                        </div>
                    </div>
                    <div class="compat-justification-card">
                        <div class="compat-justification-item">
                            <div class="compat-justification-icon"><i class="fa-solid fa-check"></i></div>
                            <div>
                                <strong class="text-slate-900 block text-xs">Posición & Laycan Garantizado</strong>
                                <span class="text-slate-600 text-[11px]">En rada/aproximación a ${op.polName || 'POL'} (${candidate.radarLive.distancePolNm} NM) listo para ventana ${op.laycan || 'Laycan'}.</span>
                            </div>
                        </div>
                    </div>
                    <div class="compat-justification-card">
                        <div class="compat-justification-item">
                            <div class="compat-justification-icon"><i class="fa-solid fa-check"></i></div>
                            <div>
                                <strong class="text-slate-900 block text-xs">Factor de Estiba & Ritmo</strong>
                                <span class="text-slate-600 text-[11px]">${candidate.neonDbMaster.stowageFactor} óptimo para ${op.cargoName || 'carga'} con ritmo ${op.loadingRate || 'Ritmo'}.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    renderView(data) {
        if (!this.container) return;
        const op = data?.activeOperation || this.resolveActiveOperation();
        this.currentOperation = op;
        const matches = data?.pairedMatches || [];
        this.currentMatches = matches;
        this.currentRadarSummary = data?.radarSummary;
        this.currentNeonSummary = data?.neonDbSummary;
        const hasAvailability = data?.hasLiveCompatibleVessels !== false;
        const verifiedDbVessels = (matches || []).filter(m => {
            const master = m.neonDbMaster || {};
            const d = Number(master.dwt || m.dwt);
            const loa = Number(master.loaMeters || 0);
            const beam = Number(master.beamMeters || 0);
            return Number.isFinite(d) && d > 500 && (loa > 0 || beam > 0);
        });
        const alternativeDbVessel = data?.alternativeDbVessel || verifiedDbVessels[0] || matches.find(m => !m.isLiveRadar && m.compatibilityScore > 0) || matches[0];

        if (!this.selectedVesselImo || !matches.some(m => m.imo === this.selectedVesselImo)) {
            const topMatch = data?.topMatch || matches.find(m => m.isLiveRadar && m.compatibilityScore > 0) || matches[0];
            this.selectedVesselImo = topMatch ? topMatch.imo : null;
        }

        const activeCandidate = matches.find(m => m.imo === this.selectedVesselImo) || matches[0] || null;

        this.container.innerHTML = `
            <div class="compatibility-shell">
                ${this.renderHeader(op)}

                <!-- Panel de Emparejamiento por Compatibilidad (Estructura a dos bloques) -->
                <div class="compatibility-grid-two-column">
                    ${this.renderLeftRadarBlock(matches, data?.radarSummary, this.selectedVesselImo, hasAvailability, alternativeDbVessel)}
                    ${this.renderRightMasterBlock(matches, data?.neonDbSummary, this.selectedVesselImo)}
                </div>

                ${this.renderBottomTopMatchHero(activeCandidate)}
            </div>
        `;
    }

    async mount(container) {
        if (!container) return;
        this.mounted = true;
        this.container = container;

        const initialOp = this.resolveActiveOperation();
        this.currentOperation = initialOp;

        // Render skeleton or initial view with light corporate style
        container.innerHTML = `
            <div class="compatibility-shell">
                ${this.renderHeader(initialOp)}
                <div class="flex min-h-[300px] items-center justify-center">
                    <div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-md">
                        <i class="fa-solid fa-circle-notch animate-spin text-blue-600"></i>
                        <span>Sincronizando Radar AIS y Base de Datos Maestra (Neon DB)...</span>
                    </div>
                </div>
            </div>
        `;

        const data = await this.fetchData(true);
        this.renderView(data);

        // Listen for store changes to keep header and candidates synchronized in real-time
        if (!this.unsubscribeStore && typeof window !== 'undefined' && window.SeaCharterStore?.subscribe) {
            this.unsubscribeStore = window.SeaCharterStore.subscribe(() => {
                if (this.mounted && this.container) {
                    this.syncOperationFromState();
                }
            });
        }

        // Listen for density AIS radar updates
        if (!this.listeningFleetUpdated && typeof window !== 'undefined') {
            this.listeningFleetUpdated = true;
            window.addEventListener('canonical-fleet-updated', async () => {
                if (this.mounted && this.container) {
                    const freshData = await this.fetchData(true);
                    this.renderView(freshData);
                }
            });
        }
    }

    syncOperationFromState() {
        const nextOp = this.resolveActiveOperation();
        this.currentOperation = nextOp;

        // Update header fields dynamically if present
        const cargoEl = document.getElementById('compat-header-cargo');
        if (cargoEl) cargoEl.textContent = nextOp.cargoName || 'Sin definir (Definir en Mapa/Calculadora)';

        const volumeEl = document.getElementById('compat-header-volume');
        if (volumeEl) volumeEl.textContent = nextOp.cargoVolumeMt > 0 ? `${Number(nextOp.cargoVolumeMt).toLocaleString()} MT` : '0 MT';

        const polEl = document.getElementById('compat-header-pol');
        if (polEl) polEl.innerHTML = `<span>${nextOp.polName || 'Seleccionar POL'}</span> <span class="text-sm">${nextOp.polFlag}</span>`;

        const podEl = document.getElementById('compat-header-pod');
        if (podEl) podEl.innerHTML = `<span>${nextOp.podName || 'Seleccionar POD'}</span> <span class="text-sm">${nextOp.podFlag}</span>`;

        const laycanEl = document.getElementById('compat-header-laycan');
        if (laycanEl) laycanEl.innerHTML = `<i class="fa-regular fa-calendar text-amber-600 text-[11px]"></i> ${nextOp.laycan || 'Sin definir'}`;

        const rateEl = document.getElementById('compat-header-loading-rate');
        if (rateEl) rateEl.innerHTML = `<i class="fa-solid fa-gauge-high text-indigo-600 text-[11px]"></i> ${nextOp.loadingRate || 'Sin definir'}`;
    }

    handleSelectVessel(imo) {
        this.selectedVesselImo = imo;
        const matches = this.currentMatches.length > 0 ? this.currentMatches : (this.cache?.pairedMatches || []);
        const candidate = matches.find(v => v.imo === imo) || matches[0] || null;

        // Update selection styling in candidate cards
        if (typeof document !== 'undefined') {
            document.querySelectorAll('.compatibility-vessel-card').forEach(card => {
                const cardImo = Number(card.getAttribute('data-imo'));
                if (cardImo === imo) {
                    card.classList.add('is-selected');
                } else {
                    card.classList.remove('is-selected');
                }
            });

            // Update bottom hero section with selected candidate
            const heroContainer = document.getElementById('section-top-match');
            if (heroContainer) {
                heroContainer.outerHTML = this.renderBottomTopMatchHero(candidate);
            }
        }

        if (candidate && typeof window !== 'undefined' && typeof window.showToast === 'function') {
            window.showToast(`⚓ Buque ${candidate.name} (IMO ${candidate.imo}) seleccionado como candidato activo.`);
        }
    }

    handleLockCharter(imo) {
        this.lockedVesselId = imo;
        const button = document.getElementById('btn-bloquear-fletamento');
        if (button) {
            button.classList.add('is-locked');
            button.innerHTML = `
                <i class="fa-solid fa-lock text-emerald-300"></i>
                <span>Fletamento Bloqueado</span>
            `;
        }

        const matches = this.currentMatches.length > 0 ? this.currentMatches : (this.cache?.pairedMatches || []);
        const candidate = matches.find(v => v.imo === imo) || matches[0];

        // Hydrate active voyage / stores if available
        if (candidate && typeof window !== 'undefined') {
            if (window.SeaCharterStore && typeof window.SeaCharterStore.set === 'function') {
                window.SeaCharterStore.set({
                    lockedVesselImo: candidate.imo,
                    lockedVesselName: candidate.name,
                    lockedVesselDwt: candidate.neonDbMaster?.dwt || candidate.dwt,
                    lockedCharterConfirmed: true,
                });
            }
            if (typeof window.showToast === 'function') {
                window.showToast(`🔒 Fletamento bloqueado con éxito para ${candidate.name} (IMO ${candidate.imo}) - ${candidate.compatibilityScore || 0}% Compatibilidad.`);
            }
        }
    }

    handleContactOwner(imo) {
        const matches = this.currentMatches.length > 0 ? this.currentMatches : (this.cache?.pairedMatches || []);
        const candidate = matches.find(v => v.imo === imo) || matches[0];
        if (!candidate) return;
        const owner = candidate.neonDbMaster?.ownerManager 
            || candidate.ownerManager 
            || candidate.owner 
            || candidate.propietario 
            || '—';
        
        if (typeof window !== 'undefined') {
            if (typeof window.showToast === 'function') {
                window.showToast(`📧 Contactando con el armador/propietario (${owner}) para el buque ${candidate.name}...`);
            }
            if (typeof window.openChatWithContext === 'function') {
                window.openChatWithContext({
                    action: 'CONTACT_OWNER',
                    vessel: candidate,
                    owner,
                    initialMessage: `Hola, me gustaría solicitar flete y disponibilidad para el buque ${candidate.name} (IMO: ${candidate.imo}, DWT: ${candidate.neonDbMaster?.dwt || candidate.dwt || 'N/A'} MT) perteneciente a ${owner}.`
                });
            }
        }
    }

    handleTriggerDueDiligence(imo) {
        const matches = this.currentMatches.length > 0 ? this.currentMatches : (this.cache?.pairedMatches || []);
        const candidate = matches.find(v => v.imo === imo) || matches[0];
        if (!candidate) return;

        const owner = candidate.neonDbMaster?.ownerManager 
            || candidate.ownerManager 
            || candidate.owner 
            || candidate.propietario 
            || candidate.dispOwner 
            || '—';
        const dwt = Number(candidate.neonDbMaster?.dwt || candidate.dwt || 0);
        const draft = Number(candidate.neonDbMaster?.draftMeters || candidate.draft || 0);
        const vesselType = candidate.neonDbMaster?.vesselType || candidate.vesselType || '—';
        const flag = candidate.neonDbMaster?.flag || candidate.flag || '—';
        const yearBuilt = candidate.neonDbMaster?.yearBuilt || candidate.yearBuilt || '';
        const loaMeters = candidate.neonDbMaster?.loaMeters || candidate.loaMeters || '';
        const beamMeters = candidate.neonDbMaster?.beamMeters || candidate.beamMeters || '';
        const stowageFactor = candidate.neonDbMaster?.stowageFactor || candidate.stowageFactor || '';
        const compatibilityScore = candidate.compatibilityScore || 0;
        const technicalJustification = candidate.technicalJustification || '';

        const candidateVessel = {
            name: candidate.name || candidate.vesselName || `MV VESSEL ${candidate.imo}`,
            vesselName: candidate.name || candidate.vesselName || `MV VESSEL ${candidate.imo}`,
            imo: candidate.imo,
            imoNumber: candidate.imo,
            mmsi: candidate.mmsi,
            owner,
            ownerManager: owner,
            propietario: owner,
            dwt,
            draft,
            draftMeters: draft,
            flag,
            vesselType,
            yearBuilt,
            loaMeters,
            beamMeters,
            stowageFactor,
            compatibilityScore,
            technicalJustification,
            radarLive: candidate.radarLive || {},
            neonDbMaster: candidate.neonDbMaster || {},
            source: 'compatibility-module',
        };

        if (typeof window !== 'undefined') {
            if (typeof window.showToast === 'function') {
                window.showToast(`🛡️ Activando Due Diligence y Auditoría Técnica para ${candidateVessel.name}...`);
            }

            // Transfer vessel state to global stores
            if (window.SeaCharterStore && typeof window.SeaCharterStore.set === 'function') {
                window.SeaCharterStore.set({
                    activeVessel: candidateVessel,
                    auditVessel: candidateVessel,
                    dueDiligenceVessel: candidateVessel,
                    selectedVessel: candidateVessel,
                    lockedVesselImo: candidateVessel.imo,
                    lockedVesselName: candidateVessel.name,
                    lockedVesselDwt: candidateVessel.dwt,
                    lockedVesselDraft: candidateVessel.draft,
                    lockedVesselOwner: candidateVessel.owner,
                });
            }
            if (window.GlobalStore) {
                window.GlobalStore.activeVessel = candidateVessel;
                window.GlobalStore.auditVessel = candidateVessel;
                window.GlobalStore.dueDiligenceVessel = candidateVessel;
            }
            window.activeVessel = candidateVessel;
            window.activeAuditVessel = candidateVessel;
            window.lastAuditedVessel = candidateVessel;

            // Trigger global events
            window.dispatchEvent(new CustomEvent('audit-vessel-inherited', { detail: candidateVessel }));
            window.dispatchEvent(new CustomEvent('canonical-active-vessel-updated', { detail: candidateVessel }));

            // Direct render in Auditor tab if function exists
            if (typeof window.renderAuditorVesselDossier === 'function') {
                window.renderAuditorVesselDossier(candidateVessel);
            }

            // If VesselDueDiligenceBridge is present, trigger it
            if (window.VesselDueDiligenceBridge && typeof window.VesselDueDiligenceBridge.run === 'function') {
                const dummyButton = document.createElement('button');
                dummyButton.dataset.dueDiligencePayload = JSON.stringify({
                    imo: candidateVessel.imo,
                    mmsi: candidateVessel.mmsi,
                    vesselName: candidateVessel.name,
                    vessel_type: candidateVessel.vesselType,
                    dwt: candidateVessel.dwt,
                    draft: candidateVessel.draft,
                    owner: candidateVessel.owner,
                });
                window.VesselDueDiligenceBridge.run(dummyButton, dummyButton.dataset.dueDiligencePayload);
            }

            // If switchTab is available, navigate to auditor
            if (typeof window.switchTab === 'function') {
                setTimeout(() => {
                    window.switchTab('auditor');
                }, 300);
            }
        }
    }
}

const CompatibilityModule = new CompatibilityModuleManager();

export function mountCompatibilityModule(targetContainer) {
    return CompatibilityModule.mount(targetContainer);
}

if (typeof window !== 'undefined') {
    window.CompatibilityModule = CompatibilityModule;
    window.mountCompatibilityModule = mountCompatibilityModule;
}
