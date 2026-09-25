import React from 'react';
import { createRoot } from 'react-dom/client';
import VisualStowagePlan from './components/VisualStowagePlan.jsx';
import VoyageExecutiveReportModal, { buildVoyageStowagePlan } from './components/VoyageExecutiveReportModal.jsx';

let voyageReportRoot = null;
let visualStowageRoot = null;

export function mountVoyageExecutiveReport(container, props = {}) {
  let mountPoint = container?.querySelector?.('#voyage-executive-report-root')
    || document.getElementById('voyage-executive-report-root')
    || container;

  if (!mountPoint) {
    mountPoint = document.getElementById('voyage-executive-report-root');
    if (!mountPoint) {
      mountPoint = document.createElement('div');
      mountPoint.id = 'voyage-executive-report-root';
      document.body.appendChild(mountPoint);
    }
  }

  if (!voyageReportRoot) {
    voyageReportRoot = createRoot(mountPoint);
  }

  const handleClose = () => {
    if (typeof props.onClose === 'function') {
      props.onClose();
    }
    const modalEl = document.getElementById('voyage-executive-report-modal');
    if (modalEl) {
      modalEl.classList.add('hidden');
    }
    const aiModalEl = document.getElementById('ai-modal');
    if (aiModalEl) {
      if (typeof window.closeAIModal === 'function') {
        window.closeAIModal();
      } else {
        aiModalEl.classList.add('hidden');
      }
    }
  };

  voyageReportRoot.render(
    <VoyageExecutiveReportModal
      isOpen={props.isOpen ?? true}
      onClose={handleClose}
      voyageData={props.voyageData || (typeof window !== 'undefined' ? window.State : null)}
      initialClientMode={Boolean(props.isClientMode ?? window.isExecutiveClientMode)}
    />
  );

  return voyageReportRoot;
}

export function mountVisualStowageInExecutiveModal(containerId = 'voyage-visual-stowage-container', options = {}) {
  const target = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!target) return null;

  const state = options.state || (typeof window !== 'undefined' ? window.State : {});
  const stowagePlan = options.stowagePlan || buildVoyageStowagePlan(state);
  const vesselType = options.vesselType || (state?.vessel ? `${state.vessel} (${state.class || 'Handysize'})` : 'Handysize Bulk Carrier 32.000 DWT');

  if (!visualStowageRoot) {
    visualStowageRoot = createRoot(target);
  }

  visualStowageRoot.render(
    <VisualStowagePlan
      stowagePlan={stowagePlan}
      vesselType={vesselType}
      projectRef={options.ref || 'EXP-VOYAGE-EST'}
    />
  );

  return visualStowageRoot;
}

if (typeof window !== 'undefined') {
  window.mountVoyageExecutiveReport = mountVoyageExecutiveReport;
  window.mountVisualStowageInExecutiveModal = mountVisualStowageInExecutiveModal;
  window.buildVoyageStowagePlan = buildVoyageStowagePlan;
  window.VoyageExecutiveReportModal = VoyageExecutiveReportModal;
  window.VisualStowagePlan = VisualStowagePlan;
}

export { VoyageExecutiveReportModal, VisualStowagePlan, buildVoyageStowagePlan };
export default VoyageExecutiveReportModal;
