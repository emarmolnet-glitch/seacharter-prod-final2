import { mountDatalasticCreditCounter, mountDatalasticCreditCounters } from './components/DatalasticCreditCounter.js';
import { recordDatalasticRadarSuccess } from './stores/datalastic-credit-store.js';

function mount() {
    mountDatalasticCreditCounters(document);
}

window.addEventListener('datalastic:radar-success', (event) => {
    recordDatalasticRadarSuccess(event.detail?.meta || {});
});

window.DatalasticCreditCounter = {
    mount: mountDatalasticCreditCounter,
    mountAll: mountDatalasticCreditCounters,
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
