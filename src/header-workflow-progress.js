import { voyageStore } from './stores/voyage-store.js';
import { trackingStore } from './stores/tracking-store.js';
import { workflowProgressStore } from './stores/workflow-progress-store.js';

const MODULE_COMPLETION_RULES = Object.freeze({
    map: ({ draft, calculator }) => Boolean(
        Number(draft?.distanceNm) > 0
        || Number(calculator?.totalMiles) > 0
        || Number(calculator?.distLaden) > 0
        || (
            draft?.pol?.name
            && draft?.pod?.name
            && draft?.laycan?.laydays
        )
    ),
    estimator: ({ progress }) => progress?.charterPartyGenerated === true,
    decisiones: ({ progress }) => progress?.finalConditionsSet === true,
    tracking: ({ tracking }) => tracking?.referenceValidated === true,
    ais: ({ progress }) => progress?.dueDiligenceCompleted === true,
    matching: ({ progress }) => progress?.radarSweepExecuted === true,
    gencon: ({ progress }) => progress?.contractAccepted === true,
    auditor: ({ progress }) => progress?.auditReportGenerated === true,
});

function shallowObjectEqual(left, right) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
        && keys.every((key) => Object.is(left[key], right[key]));
}

function readWorkflowSources(draft = voyageStore.getState().draft) {
    const globalScope = typeof window === 'undefined' ? {} : window;
    return {
        draft,
        calculator: globalScope.SeaCharterStore?.getState?.() || {},
        tracking: trackingStore.getState(),
        progress: workflowProgressStore.getState(),
    };
}

const selectDraftMapState = (state) => ({
    distanceNm: state.draft?.distanceNm,
    polName: state.draft?.pol?.name,
    podName: state.draft?.pod?.name,
    laydays: state.draft?.laycan?.laydays,
});

const selectCalculatorMapState = (state) => ({
    totalMiles: state.totalMiles,
    distLaden: state.distLaden,
});

const selectWorkflowProgress = (state) => ({
    charterPartyGenerated: state.charterPartyGenerated,
    finalConditionsSet: state.finalConditionsSet,
    dueDiligenceCompleted: state.dueDiligenceCompleted,
    radarSweepExecuted: state.radarSweepExecuted,
    contractAccepted: state.contractAccepted,
    auditReportGenerated: state.auditReportGenerated,
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

export function getHeaderWorkflowCompletion(draft, sources = readWorkflowSources(draft)) {
    return Object.fromEntries(
        Object.entries(MODULE_COMPLETION_RULES).map(([moduleId, rule]) => [moduleId, rule(sources)])
    );
}

export function renderHeaderWorkflowProgress(draft = voyageStore.getState().draft) {
    const completion = getHeaderWorkflowCompletion(draft, readWorkflowSources(draft));
    Object.entries(completion).forEach(([moduleId, complete]) => {
        document.querySelectorAll(`header [data-module-id="${moduleId}"]`).forEach((button) => {
            updateModuleButton(button, complete);
        });
    });
}

function bindHeaderWorkflowProgress() {
    const header = document.querySelector('header.app-header');
    if (!header) return;

    let renderQueued = false;
    const queueRender = () => {
        if (renderQueued) return;
        renderQueued = true;
        window.requestAnimationFrame(() => {
            renderQueued = false;
            renderHeaderWorkflowProgress();
        });
    };

    voyageStore.subscribe(selectDraftMapState, queueRender, shallowObjectEqual);
    trackingStore.subscribe((state) => state.referenceValidated, queueRender);
    workflowProgressStore.subscribe(selectWorkflowProgress, queueRender, shallowObjectEqual);
    window.SeaCharterStore?.subscribe?.(selectCalculatorMapState, queueRender, shallowObjectEqual);
    queueRender();
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindHeaderWorkflowProgress, { once: true });
} else if (typeof document !== 'undefined') {
    bindHeaderWorkflowProgress();
}
