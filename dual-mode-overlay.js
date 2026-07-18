const OVERLAY_ID = 'dual-mode-overlay';
const OVERLAY_STYLE_ID = 'dual-mode-overlay-styles';

let previouslyFocusedElement = null;
let previousBodyOverflow = '';
let dualModeReadOnlyUnsubscribe = null;

function ensureOverlayStyles() {
    if (document.getElementById(OVERLAY_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = OVERLAY_STYLE_ID;
    style.textContent = `
        #${OVERLAY_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483000;
            display: grid;
            place-items: center;
            padding: clamp(8px, 1.5vw, 20px);
            background: rgba(11, 26, 44, 0.84);
            backdrop-filter: blur(6px) saturate(0.8);
            animation: dual-overlay-fade-in 180ms ease-out both;
        }

        #${OVERLAY_ID} .dual-mode-overlay__panel {
            position: relative;
            width: min(1480px, 100%);
            height: min(940px, 100%);
            overflow: auto;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            background: #ffffff;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.28), 0 4px 6px -4px rgba(0, 0, 0, 0.24);
            animation: dual-overlay-panel-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        #${OVERLAY_ID} .dual-mode-overlay__close {
            position: fixed;
            right: clamp(22px, 3vw, 46px);
            bottom: clamp(22px, 3vw, 42px);
            z-index: 2;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            min-height: 48px;
            padding: 0 18px;
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: 8px;
            color: #ffffff;
            background: #002060;
            box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.18), 0 2px 4px -2px rgba(15, 23, 42, 0.16);
            font-size: 0.75rem;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            cursor: pointer;
            transition: background-color 160ms ease, box-shadow 160ms ease;
        }

        #${OVERLAY_ID} .dual-mode-overlay__close:hover {
            background: #004e64;
            box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.2), 0 2px 4px -2px rgba(15, 23, 42, 0.18);
        }

        #${OVERLAY_ID} .dual-mode-overlay__close:focus-visible {
            outline: 3px solid #25a18e;
            outline-offset: 4px;
        }

        #${OVERLAY_ID} .dual-mode-overlay__close-icon {
            font-size: 1.15rem;
            font-weight: 400;
            line-height: 1;
        }

        #${OVERLAY_ID} .dual-mode-overlay__loading,
        #${OVERLAY_ID} .dual-mode-overlay__error {
            display: grid;
            min-height: 100%;
            place-items: center;
            padding: 48px;
            color: #002060;
            text-align: center;
            font-family: Inter, Roboto, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #${OVERLAY_ID} .dual-mode-overlay__loading span {
            display: inline-block;
            width: 38px;
            height: 38px;
            margin-bottom: 18px;
            border: 3px solid rgba(0, 32, 96, 0.16);
            border-top-color: #25a18e;
            border-radius: 50%;
            animation: dual-overlay-spin 700ms linear infinite;
        }

        #${OVERLAY_ID} dual-trading-chartering-view {
            display: block;
            min-height: 100%;
        }

        @keyframes dual-overlay-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes dual-overlay-panel-in {
            from { opacity: 0; transform: translateY(14px) scale(0.99); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes dual-overlay-spin {
            to { transform: rotate(360deg); }
        }

        @media (max-width: 640px) {
            #${OVERLAY_ID} {
                padding: 0;
            }

            #${OVERLAY_ID} .dual-mode-overlay__panel {
                width: 100%;
                height: 100%;
                border: 0;
                border-radius: 0;
            }

            #${OVERLAY_ID} .dual-mode-overlay__close {
                right: 14px;
                bottom: 14px;
                min-height: 44px;
                padding: 0 15px;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #${OVERLAY_ID},
            #${OVERLAY_ID} .dual-mode-overlay__panel,
            #${OVERLAY_ID} .dual-mode-overlay__loading span {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
            }
        }
    `;
    document.head.appendChild(style);
}

function handleOverlayKeydown(event) {
    if (event.key === 'Escape') closeDualModeOverlay();
}

function closeDualModeOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    if (typeof dualModeReadOnlyUnsubscribe === 'function') {
        dualModeReadOnlyUnsubscribe();
        dualModeReadOnlyUnsubscribe = null;
    }
    overlay.remove();
    document.body.style.overflow = previousBodyOverflow;
    document.removeEventListener('keydown', handleOverlayKeydown);

    if (previouslyFocusedElement instanceof HTMLElement && previouslyFocusedElement.isConnected) {
        previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
}

async function openDualModeOverlay(event, readOnlyStateSource = null) {
    event?.preventDefault();

    const existingOverlay = document.getElementById(OVERLAY_ID);
    if (existingOverlay) {
        existingOverlay.querySelector('.dual-mode-overlay__close')?.focus();
        return;
    }

    ensureOverlayStyles();
    const activeElement = document.activeElement;
    previouslyFocusedElement = activeElement?.closest?.('#advanced-modules-menu')
        ? document.getElementById('advanced-modules-btn')
        : activeElement;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Modo Dual Trading y Chartering');
    overlay.innerHTML = `
        <section class="dual-mode-overlay__panel">
            <div class="dual-mode-overlay__loading" role="status">
                <div>
                    <span aria-hidden="true"></span>
                    <div>Cargando Modo Dual…</div>
                </div>
            </div>
        </section>
        <button type="button" class="dual-mode-overlay__close" aria-label="Cerrar Modo Dual">
            <span class="dual-mode-overlay__close-icon" aria-hidden="true">×</span>
            <span>Cerrar Modo Dual</span>
        </button>
    `;

    overlay.addEventListener('click', (clickEvent) => {
        const componentBackLink = clickEvent.composedPath().find((element) => (
            element instanceof HTMLAnchorElement && element.classList.contains('back-link')
        ));
        if (componentBackLink) clickEvent.preventDefault();

        if (componentBackLink || clickEvent.target === overlay || clickEvent.target.closest('.dual-mode-overlay__close')) {
            closeDualModeOverlay();
        }
    });

    document.body.appendChild(overlay);
    document.addEventListener('keydown', handleOverlayKeydown);
    overlay.querySelector('.dual-mode-overlay__close')?.focus();

    try {
        await import('./dual-trading-chartering-view.js');
        if (!overlay.isConnected) return;

        const panel = overlay.querySelector('.dual-mode-overlay__panel');
        const dualView = document.createElement('dual-trading-chartering-view');
        dualView.getExportContext = () => readOnlyStateSource?.getExportContext?.() ?? {};
        const applyReadOnlySnapshot = (snapshot = {}) => {
            dualView.fleteJustoCalculado = snapshot.fleteJustoCalculado;
            dualView.toneladasTotales = snapshot.toneladasTotales;
            dualView.factorDeEstiba = snapshot.factorDeEstiba;
            dualView.toleranciaCarga = snapshot.toleranciaCarga;
            dualView.sessionDraft = snapshot.sessionDraft;
        };
        dualView.onSessionDraftChange = (dualState) => {
            readOnlyStateSource?.updateDualState?.(dualState);
        };
        const initialSnapshot = typeof readOnlyStateSource?.getSnapshot === 'function'
            ? readOnlyStateSource.getSnapshot()
            : {};
        applyReadOnlySnapshot(initialSnapshot);
        if (typeof readOnlyStateSource?.subscribe === 'function') {
            dualModeReadOnlyUnsubscribe = readOnlyStateSource.subscribe(applyReadOnlySnapshot);
        }
        panel.replaceChildren(dualView);
    } catch (error) {
        console.error('[Modo Dual] No se pudo cargar el componente aislado.', error);
        if (!overlay.isConnected) return;

        overlay.querySelector('.dual-mode-overlay__panel').innerHTML = `
            <div class="dual-mode-overlay__error" role="alert">
                <div>
                    <strong>No se pudo abrir el Modo Dual.</strong>
                    <p>Cierra este panel e inténtalo de nuevo.</p>
                </div>
            </div>
        `;
    }
}

window.openDualModeOverlay = openDualModeOverlay;
window.closeDualModeOverlay = closeDualModeOverlay;
