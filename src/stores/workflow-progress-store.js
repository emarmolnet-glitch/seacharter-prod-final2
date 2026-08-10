import { subscribeWithSelector } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

const INITIAL_PROGRESS = Object.freeze({
    charterPartyGenerated: false,
    charterPartyReference: '',
    finalConditionsSet: false,
    dueDiligenceCompleted: false,
    dueDiligenceVesselId: '',
    radarSweepExecuted: false,
    contractAccepted: false,
    auditReportGenerated: false,
});

function cleanText(value) {
    return String(value ?? '').trim();
}

export const workflowProgressStore = createStore(subscribeWithSelector((set) => ({
    ...INITIAL_PROGRESS,
    markCharterPartyGenerated: (reference) => {
        const charterPartyReference = cleanText(reference);
        if (!charterPartyReference) return;
        set({ charterPartyGenerated: true, charterPartyReference });
    },
    markFinalConditionsSet: () => set({ finalConditionsSet: true }),
    markDueDiligenceCompleted: (vesselId) => set({
        dueDiligenceCompleted: true,
        dueDiligenceVesselId: cleanText(vesselId),
    }),
    markRadarSweepExecuted: () => set({ radarSweepExecuted: true }),
    markContractAccepted: () => set({ contractAccepted: true }),
    markAuditReportGenerated: () => set({ auditReportGenerated: true }),
    resetProgress: () => set({ ...INITIAL_PROGRESS }),
})));

if (typeof window !== 'undefined') {
    window.HeaderWorkflowStore = workflowProgressStore;
    window.HeaderWorkflowActions = Object.freeze({
        markCharterPartyGenerated: (reference) => workflowProgressStore.getState().markCharterPartyGenerated(reference),
        markFinalConditionsSet: () => workflowProgressStore.getState().markFinalConditionsSet(),
        markDueDiligenceCompleted: (vesselId) => workflowProgressStore.getState().markDueDiligenceCompleted(vesselId),
        markRadarSweepExecuted: () => workflowProgressStore.getState().markRadarSweepExecuted(),
        markContractAccepted: () => workflowProgressStore.getState().markContractAccepted(),
        markAuditReportGenerated: () => workflowProgressStore.getState().markAuditReportGenerated(),
        resetProgress: () => workflowProgressStore.getState().resetProgress(),
    });
}
