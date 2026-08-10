import { voyageStore } from './stores/voyage-store.js';
import { trackingStore } from './stores/tracking-store.js';

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
    estimator: ({ calculator }) => Boolean(
        Number(calculator?.breakEven) > 0
        || Number(calculator?.freightRate) > 0
        || Number(calculator?.freightSell) > 0
        || Number(calculator?.sugOwner) > 0
    ),
    decisiones: ({ decisions, documentRef }) => Boolean(
        decisions?.auditGenerated === true
        || decisions?.riskAuditGenerated === true
        || decisions?.scenarioGenerated === true
        || decisions?.selectedScenario
        || Number(decisions?.riskScore) > 0
        || hasMeaningfulText(documentRef?.getElementById('contenedor-recomendaciones'))
    ),
    tracking: ({ draft, tracking }) => Boolean(
        tracking?.contractPayload
        || tracking?.vessel
        || tracking?.mode === 'contract'
        || tracking?.mode === 'audit'
        || Number(draft?.ballastDistanceNm) > 0
        || Boolean(draft?.vessel?.name || draft?.vessel?.imo)
    ),
    ais: ({ calculator }) => {
        const cargoQuantity = Number(calculator?.cargoQuantity ?? calculator?.cargo) || 0;
        const stowageFactor = Number(calculator?.stowageFactor) || 0;
        const cargoVolume = Number(calculator?.cargoVolume ?? calculator?.requiredVolumeCbm)
            || cargoQuantity * stowageFactor;
        return cargoQuantity > 0 && (stowageFactor > 0 || cargoVolume > 0);
    },
    matching: ({ globalStore, matchingResults }) => Boolean(
        collectionHasItems(globalStore?.matchingVessels)
        || collectionHasItems(globalStore?.compatibleVessels)
        || collectionHasItems(globalStore?.matchingSelection?.vessels)
        || collectionHasItems(matchingResults?.vessels)
    ),
    gencon: ({ calculator, globalScope, documentRef }) => Boolean(
        globalScope?.isContractAccepted === true
        || hasText(calculator?.contractDraft)
        || hasText(calculator?.contractText)
        || hasText(calculator?.charterPartyDraft)
        || hasText(globalScope?.contractDraft)
        || hasText(documentRef?.getElementById('gc-add-notes')?.value)
    ),
    auditor: ({ calculator, workflow, globalScope, documentRef }) => Boolean(
        workflow?.legalReportGenerated === true
        || Number(calculator?.riskScore) > 0
        || Number(calculator?.complianceScore) > 0
        || Number(globalScope?.riskScore) > 0
        || hasMeaningfulText(documentRef?.getElementById('resultsContent'))
    ),
});

function hasText(value) {
    return String(value ?? '').trim().length > 0;
}

function hasMeaningfulText(element) {
    if (!element || element.classList?.contains('hidden')) return false;
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 24 && !/sin recomendaciones activas|esperando datos|no evaluado/i.test(text);
}

function collectionHasItems(value) {
    return Array.isArray(value) && value.length > 0;
}

function readWorkflowSources(draft = voyageStore.getState().draft) {
    const globalScope = typeof window === 'undefined' ? {} : window;
    const documentRef = typeof document === 'undefined' ? null : document;
    return {
        draft,
        calculator: globalScope.SeaCharterStore?.getState?.() || {},
        decisions: globalScope.dssFormState || {},
        tracking: trackingStore.getState(),
        globalStore: globalScope.GlobalStore || {},
        matchingResults: globalScope.matchingResultsState || {},
        workflow: globalScope.masterReportWorkflowState || {},
        globalScope,
        documentRef,
    };
}

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
    [
        document.getElementById('contenedor-recomendaciones'),
        document.getElementById('resultsContent'),
    ].filter(Boolean).forEach((element) => {
        observer.observe(element, { childList: true, subtree: true, characterData: true, attributes: true });
    });
    voyageStore.subscribe((state, previousState) => {
        if (state.draft === previousState.draft) return;
        draft = state.draft;
        queueRender();
    });
    trackingStore.subscribe(queueRender);
    window.SeaCharterStore?.subscribe?.(queueRender);
    document.addEventListener('input', queueRender);
    document.addEventListener('change', queueRender);
    [
        'MATCHING_EXECUTION_SUCCESS',
        'READY_FOR_MATCHING',
        'ais:matching-state-updated',
        'density-fleet-updated',
        'tracking-live:open',
        'voyage-draft:tracking-return',
    ].forEach((eventName) => window.addEventListener(eventName, queueRender));
    queueRender();
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindHeaderWorkflowProgress, { once: true });
} else if (typeof document !== 'undefined') {
    bindHeaderWorkflowProgress();
}
