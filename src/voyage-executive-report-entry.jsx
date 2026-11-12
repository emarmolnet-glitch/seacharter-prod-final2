import React from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveReportVessel } from './report-vessel.mjs';
import { translateExecutivePDF } from './executive-pdf-english.mjs';
import { EXECUTIVE_REPORT_DICTIONARY, toggleExecutiveReportLanguage } from './executive-report-dictionary.mjs';
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
      initialLanguage={props.initialLanguage || props.lang || (typeof window !== 'undefined' ? window.currentExecutiveReportLang : 'es')}
    />
  );

  return voyageReportRoot;
}

export function mountVisualStowageInExecutiveModal(containerId = 'voyage-visual-stowage-container', options = {}) {
  const target = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!target) return null;

  const state = options.state || (typeof window !== 'undefined' ? window.State : {});
  const vesselType = resolveReportVessel(state).type;
  const stowagePlan = buildVoyageStowagePlan({ ...state, vesselType });

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

// Render a fresh snapshot: never copy the open modal, which may contain base values.
export async function buildFixtureExecutiveReportHTML(state) {
  const operations = window.resolveFixtureRecapOperations?.(state);
  const approvedState = operations ? { ...state, operationalProfile: operations.operationalProfile } : state;
  const template = document.createElement('template');
  template.innerHTML = renderToStaticMarkup(
    <VoyageExecutiveReportModal voyageData={approvedState} initialClientMode={true} />
  );
  const report = template.content.firstElementChild.firstElementChild;
  report.querySelectorAll('.no-print, button').forEach(node => node.remove());
  report.querySelectorAll('*').forEach(node => { if (node.classList.contains('print:hidden')) node.remove(); });
  translateExecutivePDF(report);
  report.style.cssText = 'width:100%;max-width:none;border:0;border-radius:0;box-shadow:none;background:white';
  const section = document.createElement('section');
  section.lang = 'en';
  section.className = 'fixture-executive-appendix';
  section.style.cssText = 'break-before:page;page-break-before:always;color:#1e293b;background:white';
  section.appendChild(report);
  return section.outerHTML;
}

if (typeof window !== 'undefined') {
  window.buildFixtureExecutiveReportHTML = buildFixtureExecutiveReportHTML;
  window.mountVoyageExecutiveReport = mountVoyageExecutiveReport;
  window.mountVisualStowageInExecutiveModal = mountVisualStowageInExecutiveModal;
  window.buildVoyageStowagePlan = buildVoyageStowagePlan;
  window.VoyageExecutiveReportModal = VoyageExecutiveReportModal;
  window.VisualStowagePlan = VisualStowagePlan;
  window.EXECUTIVE_REPORT_DICTIONARY = EXECUTIVE_REPORT_DICTIONARY;
  window.toggleExecutiveReportLanguage = toggleExecutiveReportLanguage;
}

export { VoyageExecutiveReportModal, VisualStowagePlan, buildVoyageStowagePlan, EXECUTIVE_REPORT_DICTIONARY, toggleExecutiveReportLanguage };
export default VoyageExecutiveReportModal;
