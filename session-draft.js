(function initializeSeaCharterSessionDraft(globalScope) {
    'use strict';

    const SESSION_DRAFT_KEY = 'seacharter_session_draft';
    const SESSION_DRAFT_VERSION = 1;
    const DEFAULT_DEBOUNCE_MS = 1500;
    const BANNER_ID = 'session-recovery-banner';

    const SESSION_STATE_FIELDS = Object.freeze([
        'portBallast',
        'pol',
        'pod',
        'distBallast',
        'distLaden',
        'totalMiles',
        'sugOwner',
        'dualPrecioFOB',
        'dualPrecioCIF',
        'dualMargenBruto',
        'dualMargenNeto'
    ]);

    function selectSessionDraftState(state = {}) {
        return SESSION_STATE_FIELDS.reduce((snapshot, field) => {
            const value = state[field];
            snapshot[field] = value === undefined ? '' : value;
            return snapshot;
        }, {});
    }

    function parseSessionDraft(serializedDraft) {
        if (!serializedDraft) return null;

        try {
            const draft = JSON.parse(serializedDraft);
            if (!draft || draft.version !== SESSION_DRAFT_VERSION || !draft.state || typeof draft.state !== 'object') {
                return null;
            }

            const hasKnownState = SESSION_STATE_FIELDS.some((field) => Object.hasOwn(draft.state, field));
            if (!hasKnownState) return null;

            return {
                version: SESSION_DRAFT_VERSION,
                savedAt: typeof draft.savedAt === 'string' ? draft.savedAt : '',
                state: selectSessionDraftState(draft.state)
            };
        } catch (_error) {
            return null;
        }
    }

    function createRecoveryBanner(documentRef, onRestore, onDiscard) {
        const existingBanner = documentRef.getElementById(BANNER_ID);
        if (existingBanner) return existingBanner;

        const banner = documentRef.createElement('aside');
        banner.id = BANNER_ID;
        banner.className = 'session-recovery-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.innerHTML = `
            <div class="session-recovery-banner__signal" aria-hidden="true"></div>
            <div class="session-recovery-banner__content">
                <span class="session-recovery-banner__eyebrow">Borrador local detectado</span>
                <strong>Se ha detectado una estimación anterior sin guardar</strong>
            </div>
            <div class="session-recovery-banner__actions">
                <button type="button" data-session-action="restore">Restaurar Sesión</button>
                <button type="button" data-session-action="discard">Descartar</button>
            </div>
        `;
        banner.querySelector('[data-session-action="restore"]')?.addEventListener('click', onRestore);
        banner.querySelector('[data-session-action="discard"]')?.addEventListener('click', onDiscard);
        documentRef.body.prepend(banner);
        return banner;
    }

    function initialize({
        store,
        hydrate,
        storage = globalScope.localStorage,
        documentRef = globalScope.document,
        debounceMs = DEFAULT_DEBOUNCE_MS,
        setTimeoutFn = globalScope.setTimeout.bind(globalScope),
        clearTimeoutFn = globalScope.clearTimeout.bind(globalScope)
    } = {}) {
        if (!store || typeof store.getState !== 'function' || typeof store.subscribe !== 'function') {
            throw new TypeError('SeaCharterSessionDraft requiere un Store compatible.');
        }

        let pendingSave = null;
        let banner = null;
        let hasUnsavedSession = Boolean(parseSessionDraft(storage?.getItem(SESSION_DRAFT_KEY)));

        const hideBanner = () => {
            banner?.remove();
            banner = null;
            hasUnsavedSession = false;
        };

        const restoreSession = () => {
            const draft = parseSessionDraft(storage?.getItem(SESSION_DRAFT_KEY));
            if (!draft) {
                storage?.removeItem(SESSION_DRAFT_KEY);
                hideBanner();
                return;
            }

            if (typeof hydrate === 'function') hydrate(draft.state);
            hideBanner();
        };

        const discardSession = () => {
            storage?.removeItem(SESSION_DRAFT_KEY);
            hideBanner();
        };

        const mountBanner = () => {
            if (!hasUnsavedSession || !documentRef?.body) return;
            banner = createRecoveryBanner(documentRef, restoreSession, discardSession);
        };

        if (documentRef?.readyState === 'loading') {
            documentRef.addEventListener('DOMContentLoaded', mountBanner, { once: true });
        } else {
            mountBanner();
        }

        const unsubscribe = store.subscribe((state) => {
            if (pendingSave !== null) clearTimeoutFn(pendingSave);
            pendingSave = setTimeoutFn(() => {
                const draft = {
                    version: SESSION_DRAFT_VERSION,
                    savedAt: new Date().toISOString(),
                    state: selectSessionDraftState(state || store.getState())
                };
                storage?.setItem(SESSION_DRAFT_KEY, JSON.stringify(draft));
                pendingSave = null;
            }, debounceMs);
        });

        return Object.freeze({
            restoreSession,
            discardSession,
            hasUnsavedSession: () => hasUnsavedSession,
            destroy() {
                if (pendingSave !== null) clearTimeoutFn(pendingSave);
                if (typeof unsubscribe === 'function') unsubscribe();
                hideBanner();
            }
        });
    }

    globalScope.SeaCharterSessionDraft = Object.freeze({
        key: SESSION_DRAFT_KEY,
        initialize,
        parseSessionDraft,
        selectSessionDraftState
    });
}(window));
