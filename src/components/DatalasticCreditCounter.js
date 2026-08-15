import { datalasticCreditStore } from '../stores/datalastic-credit-store.js';

function formatCreditValue(value) {
    return Number.isFinite(value) ? new Intl.NumberFormat('es-ES').format(value) : '—';
}

function renderCounter(host, state, options) {
    const hasBudget = Number.isFinite(state.limit) && Number.isFinite(state.remainingCredits);
    const primaryValue = hasBudget ? state.remainingCredits : state.sessionConsumedCredits;
    const label = hasBudget ? 'créditos disponibles' : 'créditos AIS usados';
    host.dataset.state = state.status;
    host.title = hasBudget
        ? `${formatCreditValue(state.usedCredits)} usados de ${formatCreditValue(state.limit)} · periodo ${state.period || 'actual'}`
        : 'Saldo mensual no disponible; mostrando consumo de la sesión';
    host.setAttribute('aria-label', `${formatCreditValue(primaryValue)} ${label}`);
    const value = host.querySelector('[data-datalastic-credit-value]');
    const text = host.querySelector('[data-datalastic-credit-label]');
    if (value) value.textContent = state.status === 'loading' ? '…' : formatCreditValue(primaryValue);
    if (text) text.textContent = label;
    if (options.showLimit) {
        const limit = host.querySelector('[data-datalastic-credit-limit]');
        if (limit) limit.textContent = hasBudget ? `/ ${formatCreditValue(state.limit)}` : '';
    }
}

export function mountDatalasticCreditCounter(host, options = {}) {
    if (!host || host.dataset.datalasticCreditMounted === 'true') return () => {};
    const resolvedOptions = {
        valueId: options.valueId || '',
        rootId: options.rootId || '',
        showLimit: options.showLimit !== false,
        variant: options.variant || host.dataset.creditVariant || 'toolbar',
    };
    if (resolvedOptions.rootId) host.id = resolvedOptions.rootId;
    host.className = `datalastic-credit-counter datalastic-credit-counter--${resolvedOptions.variant}`;
    host.innerHTML = `
        <span class="datalastic-credit-counter__icon" aria-hidden="true"><i class="fa-solid fa-gauge-high"></i></span>
        <span class="datalastic-credit-counter__copy">
            <span class="datalastic-credit-counter__eyebrow">Datalastic API</span>
            <span class="datalastic-credit-counter__balance">
                <strong ${resolvedOptions.valueId ? `id="${resolvedOptions.valueId}"` : ''} data-datalastic-credit-value>—</strong>
                <span data-datalastic-credit-limit></span>
                <span data-datalastic-credit-label>créditos disponibles</span>
            </span>
        </span>`;
    host.dataset.datalasticCreditMounted = 'true';
    renderCounter(host, datalasticCreditStore.getState(), resolvedOptions);
    const unsubscribe = datalasticCreditStore.subscribe((state) => renderCounter(host, state, resolvedOptions));
    if (datalasticCreditStore.getState().status === 'idle') void datalasticCreditStore.getState().refresh();
    return unsubscribe;
}

export function mountDatalasticCreditCounters(root = document) {
    root.querySelectorAll('[data-datalastic-credit-counter]').forEach((host) => {
        mountDatalasticCreditCounter(host, {
            variant: host.dataset.creditVariant,
            showLimit: host.dataset.creditShowLimit !== 'false',
        });
    });
}
