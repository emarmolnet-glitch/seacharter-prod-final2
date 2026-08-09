import { voyageStore } from './stores/voyage-store.js';

const MODULE_COMPLETION_RULES = Object.freeze({
    map: (draft) => Boolean(
        draft?.pol?.name
        && draft?.pod?.name
        && draft?.laycan?.laydays
    ),
    estimator: (draft) => Number(draft?.cargo?.quantityMt) > 0,
    tracking: (draft) => (
        Number(draft?.ballastDistanceNm) > 0
        || Boolean(draft?.vessel?.name || draft?.vessel?.imo)
    ),
});

function createCompletionIndicator() {
    const indicator = document.createElement('span');
    indicator.className = 'workflow-complete-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="m8 12 2.5 2.5L16 9"></path>
        </svg>
    `;
    return indicator;
}

function updateModuleButton(button, complete) {
    const baseLabel = button.dataset.workflowBaseLabel
        || button.getAttribute('aria-label')
        || button.textContent.trim();
    button.dataset.workflowBaseLabel = baseLabel;
    button.classList.toggle('is-workflow-complete', complete);
    button.dataset.workflowComplete = String(complete);
    button.setAttribute('aria-label', complete ? `${baseLabel} · completado` : baseLabel);

    const currentIndicator = button.querySelector('.workflow-complete-indicator');
    if (complete && !currentIndicator) button.appendChild(createCompletionIndicator());
    if (!complete && currentIndicator) currentIndicator.remove();
}

export function getHeaderWorkflowCompletion(draft) {
    return Object.fromEntries(
        Object.entries(MODULE_COMPLETION_RULES).map(([moduleId, rule]) => [moduleId, rule(draft)])
    );
}

export function renderHeaderWorkflowProgress(draft = voyageStore.getState().draft) {
    const completion = getHeaderWorkflowCompletion(draft);
    Object.entries(completion).forEach(([moduleId, complete]) => {
        document.querySelectorAll(`header [data-module-id="${moduleId}"]`).forEach((button) => {
            updateModuleButton(button, complete);
        });
    });
}

function bindHeaderWorkflowProgress() {
    const header = document.querySelector('header.app-header');
    if (!header) return;

    let draft = voyageStore.getState().draft;
    let renderQueued = false;
    const queueRender = () => {
        if (renderQueued) return;
        renderQueued = true;
        window.requestAnimationFrame(() => {
            renderQueued = false;
            renderHeaderWorkflowProgress(draft);
        });
    };

    const observer = new MutationObserver(queueRender);
    observer.observe(header, { childList: true, subtree: true });
    voyageStore.subscribe((state, previousState) => {
        if (state.draft === previousState.draft) return;
        draft = state.draft;
        queueRender();
    });
    queueRender();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindHeaderWorkflowProgress, { once: true });
} else {
    bindHeaderWorkflowProgress();
}
