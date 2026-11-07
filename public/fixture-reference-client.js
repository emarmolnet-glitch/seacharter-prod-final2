(function (root) {
    const short = value => /^RDM\/\d{4}-\d{4}$/i.test(String(value || '').trim());
    let pending = null;
    let retryCount = 0;
    const maxRetries = 3;
    let circuitBroken = false;

    async function ensure(identity) {
        if (circuitBroken || retryCount >= maxRetries) {
            return '';
        }
        try {
            const response = await root.fetch('/api/fixture-reference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity })
            });

            if (!response.ok) {
                retryCount++;
                if (response.status === 503 || retryCount >= maxRetries) {
                    circuitBroken = true;
                }
                return '';
            }

            const data = await response.json();
            if (!short(data?.reference)) {
                retryCount++;
                if (retryCount >= maxRetries) {
                    circuitBroken = true;
                }
                return '';
            }

            retryCount = 0;
            return data.reference.toUpperCase();
        } catch (error) {
            retryCount++;
            if (error?.status === 503 || error?.statusCode === 503 || retryCount >= maxRetries) {
                circuitBroken = true;
            }
            return '';
        }
    }

    function create() {
        if (circuitBroken || retryCount >= maxRetries) {
            return '';
        }
        if (!pending) {
            const initialReference = root.State?.activeReference || root.activeProjectRef || '';
            // UUID is only an internal idempotency key, never a commercial reference.
            const uuid = (root.crypto && typeof root.crypto.randomUUID === 'function')
                ? root.crypto.randomUUID()
                : 'idemp-' + Date.now();

            pending = ensure(uuid).then(reference => {
                if (!reference) return '';
                const currentReference = root.State?.activeReference || root.activeProjectRef || '';
                if (currentReference && currentReference !== initialReference) return reference;
                const manager = root.ContractRefManager;
                manager?.setActiveContractRef?.(reference);
                if (root.State) Object.assign(root.State, { estimationId: reference, activeReference: reference, activeProjectRef: reference });
                root.activeProjectRef = reference;
                const input = root.document?.getElementById('quick-ref');
                if (input) input.value = reference;
                root.dispatchEvent?.(new CustomEvent('contract-reference:changed', { detail: { reference, activeProjectRef: reference } }));
                return reference;
            }).catch(() => {
                // Gestione silenciosa de errores: dejar referencia como vacia sin bloquear la app
                return '';
            }).finally(() => {
                pending = null;
            });
        }
        // Synchronous callers wait for the reference-changed event; no fabricated reference is displayed.
        return '';
    }

    root.FixtureReferenceService = {
        ensure,
        create,
        isShort: short,
        getRetryCount: () => retryCount,
        isCircuitBroken: () => circuitBroken,
        resetCircuitBreaker: () => {
            retryCount = 0;
            circuitBroken = false;
        }
    };
})(globalThis);
