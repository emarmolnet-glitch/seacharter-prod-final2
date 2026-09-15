(function initializeContractReference(globalObject) {
    'use strict';

    const SESSION_KEY = 'active_contract_ref';
    const SHARED_STORAGE_KEY = 'active_core_pro_session';
    const BROADCAST_CHANNEL_NAME = 'core_bridge_sync';
    const SYNC_BROADCAST_CHANNEL_NAME = 'seacharter_sync_channel';
    const URL_KEYS = ['ref', 'contract_ref', 'reference', 'target_session_id', 'targetSessionId', 'sessionId', 'session_id'];

    let activeCachedReference = '';
    let lastPersistedReference = '';
    let isSaving = false;
    let persistDebounceTimer = null;
    let isInitializedOnMount = false;
    let syncBroadcastChannel = null;

    function normalizeReference(value) {
        return String(value || '').trim().toUpperCase();
    }

    function getOrCreateSyncChannel() {
        if (syncBroadcastChannel) return syncBroadcastChannel;
        if (typeof globalObject.BroadcastChannel === 'function') {
            try {
                syncBroadcastChannel = new globalObject.BroadcastChannel(SYNC_BROADCAST_CHANNEL_NAME);
                console.log('[Core PRO] Canal de sincronización abierto');
                if (typeof syncBroadcastChannel.addEventListener === 'function') {
                    syncBroadcastChannel.addEventListener('message', handleSyncChannelMessage);
                } else {
                    syncBroadcastChannel.onmessage = handleSyncChannelMessage;
                }
            } catch (_error) {
                syncBroadcastChannel = null;
            }
        }
        return syncBroadcastChannel;
    }

    function handleSyncChannelMessage(event) {
        const data = event?.data;
        const isPing = data === 'PING_SESSION' || data?.type === 'PING_SESSION';
        if (isPing) {
            const currentRef = getCurrentReference() || getActiveContractRef();
            console.log('[Core PRO] PING recibido, respondiendo con:', currentRef);
            if (currentRef) {
                broadcastCoreSessionActive(currentRef);
            }
        }
    }

    function extractCurrentPortGeographicState() {
        if (!globalObject.document) return {};
        try {
            const doc = globalObject.document;
            const state = globalObject.State || {};
            const polName = (doc.getElementById('map-port-pol')?.value || doc.getElementById('port-pol')?.value || state.pol || state.portPol || '').trim();
            const podName = (doc.getElementById('map-port-pod')?.value || doc.getElementById('port-pod')?.value || state.pod || state.portPod || '').trim();
            const ballastName = (doc.getElementById('map-port-ballast')?.value || doc.getElementById('port-ballast')?.value || state.portBallast || '').trim();
            const laydaysStart = (doc.getElementById('map-laycan-date')?.value || doc.getElementById('laycan-date')?.value || state.laydaysDate || state.laydays || '').trim();
            const cancelling = (doc.getElementById('map-cancelling-date')?.value || doc.getElementById('cancelling-date')?.value || state.cancellingDate || state.cancelling || '').trim();
            const vesselName = (doc.getElementById('vessel-name')?.value || state.vesselName || globalObject.currentSelectedVesselName || '').trim();
            const imo = (doc.getElementById('vessel-imo')?.value || state.imo || globalObject.currentSelectedVesselImo || '').trim();
            const cargoName = (doc.getElementById('cargo-name')?.value || state.cargoName || '').trim();
            const cargoQty = parseFloat(doc.getElementById('cargo-quantity')?.value || state.cargoQuantity || 0) || 0;

            let polLat = parseFloat(doc.getElementById('match-load-lat')?.value || '') || 0;
            let polLng = parseFloat(doc.getElementById('match-load-lon')?.value || '') || 0;
            let podLat = parseFloat(doc.getElementById('match-discharge-lat')?.value || '') || 0;
            let podLng = parseFloat(doc.getElementById('match-discharge-lon')?.value || '') || 0;

            if (globalObject.activeMaritimeRoute?.coordinates) {
                const cPol = globalObject.activeMaritimeRoute.coordinates.pol;
                const cPod = globalObject.activeMaritimeRoute.coordinates.pod;
                if (!polLat && cPol) polLat = Number(cPol.lat ?? cPol.latitude) || 0;
                if (!polLng && cPol) polLng = Number(cPol.lng ?? cPol.lon ?? cPol.longitude) || 0;
                if (!podLat && cPod) podLat = Number(cPod.lat ?? cPod.latitude) || 0;
                if (!podLng && cPod) podLng = Number(cPod.lng ?? cPod.lon ?? cPod.longitude) || 0;
            }

            const geo = {};
            if (polName) {
                geo.pol = polName;
                geo.pol_name = polName;
                geo.loadPortName = polName;
                geo.load_port = polName;
            }
            if (podName) {
                geo.pod = podName;
                geo.pod_name = podName;
                geo.dischargePortName = podName;
                geo.discharge_port = podName;
            }
            if (ballastName) {
                geo.ballast = ballastName;
                geo.port_ballast = ballastName;
            }
            if (polLat) geo.pol_latitude = polLat;
            if (polLng) geo.pol_longitude = polLng;
            if (podLat) geo.pod_latitude = podLat;
            if (podLng) geo.pod_longitude = podLng;
            if (laydaysStart) {
                geo.laydays_start_at = laydaysStart;
                geo.laydaysStartAt = laydaysStart;
            }
            if (cancelling) {
                geo.cancelling_at = cancelling;
                geo.cancellingAt = cancelling;
            }
            if (vesselName) {
                geo.vessel_name = vesselName;
                geo.vesselName = vesselName;
            }
            if (imo) {
                geo.imo_number = imo;
                geo.imoNumber = imo;
            }
            if (cargoName) {
                geo.cargo_name = cargoName;
                geo.cargoName = cargoName;
            }
            if (cargoQty) {
                geo.cargo_quantity_mt = cargoQty;
                geo.cargoQuantityMt = cargoQty;
            }
            return geo;
        } catch (_err) {
            return {};
        }
    }

    function persistSessionToDatabase(reference, extraPayload, immediate = false) {
        const normalized = normalizeReference(reference) || getCurrentReference();
        if (!normalized) return Promise.resolve(null);

        // Guard against redundant duplicate saves
        if (normalized === lastPersistedReference && !extraPayload) {
            return Promise.resolve(null);
        }

        const timerApi = globalObject.setTimeout || globalThis.setTimeout;
        const clearTimerApi = globalObject.clearTimeout || globalThis.clearTimeout;

        if (persistDebounceTimer && typeof clearTimerApi === 'function') {
            clearTimerApi(persistDebounceTimer);
            persistDebounceTimer = null;
        }

        const executeSave = function() {
            if (isSaving) return Promise.resolve(null);
            if (typeof globalObject.fetch !== 'function') return Promise.resolve(null);

            isSaving = true;
            const geoState = extractCurrentPortGeographicState();
            const payload = {
                id: 'current_session',
                key: 'current_session',
                session_ref: normalized,
                currentSessionRef: normalized,
                reference: normalized,
                timestamp: Date.now(),
                ...geoState,
                ...(extraPayload && typeof extraPayload === 'object' ? extraPayload : {})
            };

            const getApiUrl = globalObject.getApiUrl || function(url) { return url; };

            // Direct structural UPSERT to session_sync if geographic ports are present
            if (payload.pol || payload.pod) {
                try {
                    const sessionSyncPayload = {
                        user_id: '1c8db801b-b053-4847-bbc4-edd7d0abbe0e',
                        sync_id: normalized,
                        last_action_module: 'CORE_PRO_MATCHING',
                        last_sync_data: {
                            format: 'v2',
                            syncId: normalized,
                            reference: normalized,
                            pol: payload.pol || payload.pol_name || '',
                            pod: payload.pod || payload.pod_name || '',
                            pol_name: payload.pol_name || payload.pol || '',
                            pod_name: payload.pod_name || payload.pod || '',
                            load_port: payload.pol_name || payload.pol || '',
                            discharge_port: payload.pod_name || payload.pod || '',
                            pol_latitude: payload.pol_latitude || 0,
                            pol_longitude: payload.pol_longitude || 0,
                            pod_latitude: payload.pod_latitude || 0,
                            pod_longitude: payload.pod_longitude || 0,
                            laydays_start_at: payload.laydays_start_at || payload.laydaysStartAt || null,
                            cancelling_at: payload.cancelling_at || payload.cancellingAt || null,
                            vessel_name: payload.vessel_name || payload.vesselName || '',
                            imo_number: payload.imo_number || payload.imoNumber || '',
                            cargo_name: payload.cargo_name || payload.cargoName || '',
                            cargo_quantity_mt: payload.cargo_quantity_mt || payload.cargoQuantityMt || 0,
                            vessels: [],
                            updated_at: new Date().toISOString()
                        }
                    };
                    globalObject.fetch(getApiUrl('/api/session-sync'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(sessionSyncPayload)
                    }).catch(function() {});
                } catch (_) {}
            }

            return globalObject.fetch(getApiUrl('/api/app-state'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            }).then(function(res) {
                if (!res.ok) {
                    return res.text().then(function(text) {
                        let errMsg = 'HTTP ' + res.status;
                        try {
                            const parsed = JSON.parse(text);
                            if (parsed.error) errMsg += ': ' + parsed.error;
                        } catch (_) {
                            if (text) errMsg += ': ' + text;
                        }
                        throw new Error(errMsg);
                    });
                }
                return res.json();
            }).then(function(data) {
                lastPersistedReference = normalized;
                console.log('[Core PRO] Sesión activa guardada en Neon:', normalized);
                return data;
            }).catch(function(err) {
                console.warn('[Core PRO] No se pudo persistir la sesión activa en backend:', err?.message || err);
                return null;
            }).finally(function() {
                isSaving = false;
            });
        };

        if (immediate || typeof timerApi !== 'function') {
            return executeSave();
        }

        return new Promise(function(resolve) {
            persistDebounceTimer = timerApi(function() {
                persistDebounceTimer = null;
                resolve(executeSave());
            }, 500);
        });
    }

    function broadcastCoreSessionActive(reference) {
        const normalized = normalizeReference(reference) || getCurrentReference();
        if (!normalized) return null;

        const payload = {
            type: 'CORE_SESSION_ACTIVE',
            reference: normalized,
            timestamp: Date.now()
        };

        try {
            const channel = getOrCreateSyncChannel();
            if (channel) {
                channel.postMessage(payload);
            } else if (typeof globalObject.BroadcastChannel === 'function') {
                const tempChannel = new globalObject.BroadcastChannel(SYNC_BROADCAST_CHANNEL_NAME);
                tempChannel.postMessage(payload);
                tempChannel.close?.();
            }
        } catch (_error) {}

        persistSessionToDatabase(normalized);

        return payload;
    }

    function readSessionReference() {
        try {
            return normalizeReference(globalObject.sessionStorage?.getItem(SESSION_KEY));
        } catch (_error) {
            return '';
        }
    }

    function writeSessionReference(reference) {
        const normalized = normalizeReference(reference);
        if (!normalized) return;
        try {
            const current = readSessionReference();
            if (current === normalized) return;
            globalObject.sessionStorage?.setItem(SESSION_KEY, normalized);
        } catch (_error) {}
    }

    function writeSharedActiveSession(reference) {
        const normalized = normalizeReference(reference);
        if (!normalized) return;

        let existingSharedRef = '';
        try {
            const raw = globalObject.localStorage?.getItem(SHARED_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                existingSharedRef = normalizeReference(parsed?.reference);
            }
        } catch (_error) {}

        if (existingSharedRef !== normalized) {
            const payload = { reference: normalized, timestamp: Date.now() };
            try {
                globalObject.localStorage?.setItem(SHARED_STORAGE_KEY, JSON.stringify(payload));
            } catch (_error) {}
            try {
                if (typeof globalObject.BroadcastChannel === 'function') {
                    const channel = new globalObject.BroadcastChannel(BROADCAST_CHANNEL_NAME);
                    channel.postMessage({ type: 'active_core_pro_session', ...payload });
                    channel.close?.();
                }
            } catch (_error) {}
        }

        broadcastCoreSessionActive(normalized);
    }

    function clearSharedActiveSession() {
        activeCachedReference = '';
        try {
            globalObject.localStorage?.removeItem(SHARED_STORAGE_KEY);
        } catch (_error) {}
        try {
            if (typeof globalObject.BroadcastChannel === 'function') {
                const channel = new globalObject.BroadcastChannel(BROADCAST_CHANNEL_NAME);
                channel.postMessage({ type: 'active_core_pro_session_cleared', reference: null, timestamp: Date.now() });
                channel.close?.();
            }
        } catch (_error) {}
    }

    function readUrlReference() {
        const params = new URLSearchParams(globalObject.location?.search || '');
        for (const key of URL_KEYS) {
            const reference = normalizeReference(params.get(key));
            if (reference) return reference;
        }
        return '';
    }

    function writeUrlReference(reference) {
        if (!globalObject.location || !globalObject.history?.replaceState) return;
        const normalized = normalizeReference(reference);
        if (!normalized) return;

        let url;
        try {
            url = new URL(globalObject.location.href);
        } catch (_error) {
            return;
        }

        const rawRef = url.searchParams.get('ref');
        const hasLegacyRef = url.searchParams.has('contract_ref');
        if (rawRef === normalized && !hasLegacyRef) {
            return;
        }

        url.searchParams.set('ref', normalized);
        url.searchParams.delete('contract_ref');
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        const currentUrl = `${globalObject.location.pathname || ''}${globalObject.location.search || ''}${globalObject.location.hash || ''}`;
        if (currentUrl !== nextUrl) {
            globalObject.history.replaceState(globalObject.history.state, '', nextUrl);
        }
    }

    function generateVoyageRef() {
        const randomValues = new Uint32Array(1);
        if (globalObject.crypto?.getRandomValues) {
            globalObject.crypto.getRandomValues(randomValues);
        } else {
            randomValues[0] = Math.floor(Math.random() * 0xFFFFFFFF);
        }
        const suffix = String(randomValues[0] % 10000).padStart(4, '0');
        return `RDM/${new Date().getFullYear()}-${suffix}`;
    }

    const generateReference = generateVoyageRef;

    function generateNextVoyageRef(currentReference = '') {
        const year = new Date().getFullYear();
        const match = normalizeReference(currentReference).match(/^RDM\/(\d{4})-(\d{4})$/);
        if (!match || Number(match[1]) !== year) return generateVoyageRef();
        const nextSequence = (Number(match[2]) + 1) % 10000;
        return `RDM/${year}-${String(nextSequence).padStart(4, '0')}`;
    }

    function getCurrentReference() {
        return activeCachedReference || readUrlReference() || readSessionReference() || '';
    }

    function persistReference(reference, notify = false) {
        const normalized = normalizeReference(reference);
        if (!normalized) return '';

        const currentRef = getCurrentReference();
        const isChanged = currentRef !== normalized;

        activeCachedReference = normalized;
        writeSessionReference(normalized);
        writeUrlReference(normalized);
        writeSharedActiveSession(normalized);

        // Emitir al Parent si estamos dentro de un Iframe (MasterHub)
        if (window.parent !== window) {
          try {
            window.parent.postMessage({ 
              type: 'SYNC_REFERENCE', 
              reference: normalized // Reemplaza por tu variable local de referencia
            }, '*');
          } catch (e) {
            console.warn("No se pudo emitir la referencia al parent", e);
          }
        }

        if (notify && isChanged && typeof globalObject.dispatchEvent === 'function' && typeof globalObject.CustomEvent === 'function') {
            globalObject.dispatchEvent(new globalObject.CustomEvent('contract-reference:changed', { detail: { reference: normalized } }));
        }
        return normalized;
    }

    function getActiveContractRef() {
        const fromUrl = readUrlReference();
        if (fromUrl) {
            activeCachedReference = fromUrl;
            writeSessionReference(fromUrl);
            writeUrlReference(fromUrl);
            writeSharedActiveSession(fromUrl);
            return fromUrl;
        }
        const fromSession = readSessionReference();
        if (fromSession) {
            activeCachedReference = fromSession;
            writeUrlReference(fromSession);
            writeSharedActiveSession(fromSession);
            return fromSession;
        }
        if (activeCachedReference) {
            return activeCachedReference;
        }
        const generated = generateVoyageRef();
        activeCachedReference = generated;
        return persistReference(generated, false);
    }

    function setActiveContractRef(reference) {
        const normalized = normalizeReference(reference);
        if (!normalized) return getActiveContractRef();
        const currentRef = getCurrentReference();
        if (currentRef === normalized) {
            activeCachedReference = normalized;
            return normalized;
        }
        return persistReference(normalized, true);
    }

    function clearActiveSession() {
        const previousRef = activeCachedReference || readSessionReference();
        activeCachedReference = '';
        try {
            globalObject.sessionStorage?.removeItem(SESSION_KEY);
        } catch (_error) {}
        clearSharedActiveSession();
        if (previousRef && typeof globalObject.dispatchEvent === 'function' && typeof globalObject.CustomEvent === 'function') {
            globalObject.dispatchEvent(new globalObject.CustomEvent('contract-reference:cleared', { detail: { reference: '' } }));
        }
    }

    function ensureUrlReference() {
        const ref = getActiveContractRef();
        if (ref) {
            writeUrlReference(ref);
        }
        return ref;
    }

    let isInjectionLocked = false;

    function setInjectionLock(locked) {
        isInjectionLocked = Boolean(locked);
    }

    function isLocked() {
        return isInjectionLocked;
    }

    function createNewReference(force = false) {
        if (isInjectionLocked && !force) {
            return getActiveContractRef();
        }
        return persistReference(generateNextVoyageRef(getActiveContractRef()), true);
    }

    function extractCurrentVoyageReference() {
        try {
            const currentRef = getCurrentReference() || (typeof getActiveContractRef === 'function' ? getActiveContractRef() : '');
            if (currentRef && String(currentRef).trim() && String(currentRef).trim() !== '—') {
                return String(currentRef).trim();
            }
        } catch (_e) {}

        try {
            if (globalObject.document) {
                const domCandidates = [
                    globalObject.document.getElementById('contract-reference'),
                    globalObject.document.getElementById('audit-contract-reference'),
                    globalObject.document.getElementById('current-voyage-reference'),
                    globalObject.document.getElementById('voyage-reference'),
                    globalObject.document.getElementById('new-estimation-current-reference'),
                    globalObject.document.getElementById('dossier-modal-reference'),
                    globalObject.document.getElementById('databridge-session-badge'),
                    globalObject.document.querySelector?.('[data-contract-reference]'),
                    globalObject.document.querySelector?.('[data-voyage-reference]'),
                    globalObject.document.querySelector?.('input[name="contract_ref"]'),
                    globalObject.document.querySelector?.('input[name="reference"]')
                ];
                for (const el of domCandidates) {
                    if (!el) continue;
                    const val = (el.value || el.dataset?.reference || el.textContent || '').trim();
                    if (!val || val === '—' || val === '-') continue;
                    const match = val.match(/RDM\/[A-Z0-9_-]+/i);
                    if (match) return match[0];
                    const clean = val.replace(/^REF:\s*/i, '').trim();
                    if (clean && clean !== '—') return clean;
                }
            }
        } catch (_e) {}

        return '';
    }

    function buildEcosystemUrl(baseUrl, currentReference) {
        const rawRef = String(currentReference !== undefined ? (currentReference || '') : extractCurrentVoyageReference()).trim();
        const cleanBase = baseUrl.replace(/\/?$/, '/');
        if (!rawRef) {
            return cleanBase;
        }
        return `${cleanBase}?ref=${encodeURI(rawRef)}`;
    }

    function handleEcosystemLinkClick(event, baseUrl) {
        const currentReference = extractCurrentVoyageReference();
        const targetUrl = buildEcosystemUrl(baseUrl, currentReference);
        if (event?.currentTarget) {
            event.currentTarget.setAttribute('href', targetUrl);
            event.currentTarget.href = targetUrl;
        }
        if (typeof globalObject.closeMobileSessionMenu === 'function') {
            setTimeout(globalObject.closeMobileSessionMenu, 0);
        }
    }

    function updateEcosystemMenuLinks() {
        if (!globalObject.document) return;
        const currentRef = extractCurrentVoyageReference();
        const dataBridgeLink = globalObject.document.getElementById('btn-toggle-databridge');
        const landCharterLink = globalObject.document.getElementById('btn-open-land-charter');
        if (dataBridgeLink) {
            dataBridgeLink.setAttribute('href', buildEcosystemUrl('https://calm-shortbread-55bcfc.netlify.app/', currentRef));
        }
        if (landCharterLink) {
            landCharterLink.setAttribute('href', buildEcosystemUrl('https://landchartercorepro.netlify.app/', currentRef));
        }
    }

    const contractReferenceManager = Object.freeze({
        SESSION_KEY,
        SHARED_STORAGE_KEY,
        BROADCAST_CHANNEL_NAME,
        SYNC_BROADCAST_CHANNEL_NAME,
        broadcastCoreSessionActive,
        emitActiveSession: broadcastCoreSessionActive,
        clearActiveReference: clearActiveSession,
        clearActiveSession,
        clearSharedActiveSession,
        createNewReference,
        ensureUrlReference,
        generateReference,
        generateNextVoyageRef,
        generateVoyageRef,
        getActiveContractRef,
        isInjectionLocked: isLocked,
        normalizeReference,
        persistSessionToDatabase,
        saveSessionState: persistSessionToDatabase,
        syncSessionToDatabase: persistSessionToDatabase,
        setActiveContractRef,
        setInjectionLock,
        writeSharedActiveSession,
        buildEcosystemUrl,
        extractCurrentVoyageReference,
        handleEcosystemLinkClick,
        updateEcosystemMenuLinks,
    });

    globalObject.ContractRefManager = contractReferenceManager;
    globalObject.ContractReference = contractReferenceManager;
    globalObject.getActiveContractRef = getActiveContractRef;
    globalObject.setActiveContractRef = setActiveContractRef;
    globalObject.clearActiveCoreProSession = clearActiveSession;
    globalObject.generateVoyageRef = generateVoyageRef;
    globalObject.broadcastCoreSessionActive = broadcastCoreSessionActive;
    globalObject.emitActiveSession = broadcastCoreSessionActive;
    globalObject.persistSessionToDatabase = persistSessionToDatabase;
    globalObject.saveSessionState = persistSessionToDatabase;
    globalObject.extractCurrentVoyageReference = extractCurrentVoyageReference;
    globalObject.buildEcosystemUrl = buildEcosystemUrl;
    globalObject.handleEcosystemLinkClick = handleEcosystemLinkClick;
    globalObject.updateEcosystemMenuLinks = updateEcosystemMenuLinks;

    function initializeOnMount() {
        if (isInitializedOnMount) return;
        isInitializedOnMount = true;
        getOrCreateSyncChannel();
        getActiveContractRef();
        updateEcosystemMenuLinks();
    }

    try {
        if (globalObject.location || globalObject.document) {
            initializeOnMount();
        }
    } catch (_error) {}

    try {
        if (typeof globalObject.addEventListener === 'function') {
            globalObject.addEventListener('pagehide', () => {
                clearSharedActiveSession();
            });
        }
    } catch (_error) {}
})(window);
