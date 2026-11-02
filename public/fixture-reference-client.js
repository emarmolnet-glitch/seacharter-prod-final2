(function (root) {
    const short = value => /^RDM\/\d{4}-\d{4}$/i.test(String(value || '').trim());
    let pending = null;
    async function ensure(identity) {
        const response = await root.fetch('/api/fixture-reference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity }) });
        if (!response.ok) throw new Error('No se pudo asignar una referencia de expediente. Inténtelo de nuevo.');
        const data = await response.json();
        if (!short(data.reference)) throw new Error('Referencia de expediente inválida');
        return data.reference.toUpperCase();
    }
    function create() {
        if (!pending) {
            const initialReference = root.State?.activeReference || root.activeProjectRef || '';
            // UUID is only an internal idempotency key, never a commercial reference.
            pending = ensure(root.crypto.randomUUID()).then(reference => {
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
            }).catch(error => { root.showToast?.(error.message); return ''; }).finally(() => { pending = null; });
        }
        // Synchronous callers wait for the reference-changed event; no fabricated reference is displayed.
        return '';
    }
    root.FixtureReferenceService = { ensure, create, isShort: short };
})(globalThis);
