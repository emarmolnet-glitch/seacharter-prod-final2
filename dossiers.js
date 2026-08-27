(function () {
    const state = {
        activeId: null,
        activeStatus: 'BORRADOR',
        activeClientName: '',
        activeInternalNotes: '',
        dossiers: [],
        query: '',
        modalMode: 'save',
    };

    const text = (id) => String(document.getElementById(id)?.value || '').trim();
    const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    const formatDate = (value) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    const cargoLabel = () => window.getCargoTaxonomyLabel?.(text('cargo-type-manual')) || text('cargo-type-manual') || text('cargo-type') || 'Sin especificar';

    function metadata(payload, clientName, internalNotes) {
        return {
            reference: text('quick-ref') || payload?.calculatorState?.activeReference || '',
            pol: text('port-pol') || text('map-port-pol'),
            pod: text('port-pod') || text('map-port-pod'),
            cargoName: cargoLabel(),
            cargoVolume: Number(text('cargo-qty')) || 0,
            charterer: clientName,
            internalNotes,
            status: state.activeStatus,
        };
    }

    async function request(path = '', options = {}) {
        const response = await fetch(`/api/dossiers${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.error || 'No se pudo completar la operación');
        return data;
    }

    async function persistCurrent(clientName = '', internalNotes = '') {
        const payload = window.buildAuditSessionPayload?.();
        if (!payload) throw new Error('El estado global no está disponible');
        payload.clientName = clientName;
        payload.internalNotes = internalNotes;
        const dossierData = { ...metadata(payload, clientName, internalNotes), sessionPayload: payload };
        const data = state.activeId
            ? await request(`/${state.activeId}`, { method: 'PUT', body: JSON.stringify(dossierData) })
            : await request('', { method: 'POST', body: JSON.stringify(dossierData) });
        state.activeId = data.dossier.id;
        state.activeStatus = data.dossier.status;
        state.activeClientName = data.dossier.charterer || '';
        state.activeInternalNotes = data.dossier.internalNotes || '';
        window.persistLocalAuditSession?.(payload);
        document.body.dataset.activeDossierId = state.activeId;
        if (data.dossier.reference) window.syncActiveContractReference?.(data.dossier.reference);
        window.showToast?.(`Dossier ${data.dossier.reference} guardado`, false, 'success');
        if (document.getElementById('view-dossiers')?.classList.contains('active-block')) await loadList();
        return data.dossier;
    }

    function modalElements() {
        return {
            modal: document.getElementById('dossier-save-modal'),
            reference: document.getElementById('dossier-modal-reference'),
            clientName: document.getElementById('dossier-client-name'),
            internalNotes: document.getElementById('dossier-internal-notes'),
            confirm: document.getElementById('dossier-confirm-save'),
            error: document.getElementById('dossier-modal-error'),
        };
    }

    function newEstimationModalElements() {
        return {
            modal: document.getElementById('new-estimation-modal'),
            reference: document.getElementById('new-estimation-current-reference'),
            save: document.getElementById('new-estimation-save'),
            discard: document.getElementById('new-estimation-discard'),
            error: document.getElementById('new-estimation-modal-error'),
        };
    }

    function inferredClientName() {
        return text('coa-client-name') || text('gc-charterer') || text('asb-charterer') || '';
    }

    function openSaveModal(mode = 'save') {
        const elements = modalElements();
        if (!elements.modal) return;
        state.modalMode = mode;
        const reference = text('quick-ref') || 'Pendiente de asignación';
        elements.reference.textContent = `REF: ${reference}`;
        elements.clientName.value = state.activeClientName || inferredClientName();
        elements.internalNotes.value = state.activeInternalNotes;
        elements.error.textContent = '';
        elements.error.classList.add('hidden');
        elements.confirm.disabled = false;
        elements.confirm.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Confirmar Guardado';
        elements.modal.classList.add('is-open');
        elements.modal.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => elements.clientName.focus(), 0);
    }

    function closeSaveModal() {
        const { modal } = modalElements();
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function requestSave() {
        openSaveModal('save');
    }

    function requestNewEstimation() {
        const elements = newEstimationModalElements();
        if (!elements.modal) return;
        elements.reference.textContent = `REF: ${text('quick-ref') || 'Pendiente de asignación'}`;
        elements.error.textContent = '';
        elements.error.classList.add('hidden');
        elements.save.disabled = false;
        elements.discard.disabled = false;
        elements.save.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar y Continuar';
        elements.modal.classList.add('is-open');
        elements.modal.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => elements.save.focus(), 0);
    }

    function closeNewEstimationModal() {
        const { modal } = newEstimationModalElements();
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.getElementById('new-estimation-btn')?.focus();
    }

    function resetGlobalState() {
        const storeReset = window.SeaCharterStore?.resetGlobalState;
        if (typeof storeReset === 'function') return storeReset.call(window.SeaCharterStore);
        if (typeof window.resetGlobalState === 'function') return window.resetGlobalState();
        return window.resetTotalEstimation?.();
    }

    async function saveAndStartNewEstimation() {
        const elements = newEstimationModalElements();
        elements.save.disabled = true;
        elements.discard.disabled = true;
        elements.error.classList.add('hidden');
        elements.save.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...';
        try {
            await persistCurrent(state.activeClientName || inferredClientName(), state.activeInternalNotes);
            closeNewEstimationModal();
            resetGlobalState();
        } catch (error) {
            elements.error.textContent = error.message || 'No se pudo guardar la estimación. El trabajo actual se mantiene intacto.';
            elements.error.classList.remove('hidden');
            elements.save.disabled = false;
            elements.discard.disabled = false;
            elements.save.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar y Continuar';
        }
    }

    function discardAndStartNewEstimation() {
        closeNewEstimationModal();
        resetGlobalState();
    }

    async function confirmSave() {
        const elements = modalElements();
        const clientName = elements.clientName.value.trim();
        const internalNotes = elements.internalNotes.value.trim();
        elements.confirm.disabled = true;
        elements.confirm.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...';
        elements.error.classList.add('hidden');
        try {
            await persistCurrent(clientName, internalNotes);
            const shouldReset = state.modalMode === 'new';
            closeSaveModal();
            if (shouldReset) window.resetTotalEstimation?.();
        } catch (error) {
            elements.error.textContent = error.message || 'No se pudo guardar el expediente.';
            elements.error.classList.remove('hidden');
            elements.confirm.disabled = false;
            elements.confirm.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Confirmar Guardado';
        }
    }

    async function openDossier(id) {
        const data = await request(`/${id}`);
        state.activeId = data.dossier.id;
        state.activeStatus = data.dossier.status;
        state.activeClientName = data.dossier.charterer || data.dossier.sessionPayload?.clientName || '';
        state.activeInternalNotes = data.dossier.internalNotes || data.dossier.sessionPayload?.internalNotes || '';
        document.body.dataset.activeDossierId = state.activeId;
        await window.applyAuditSessionPayload?.(data.dossier.sessionPayload);
        window.persistLocalAuditSession?.(data.dossier.sessionPayload);
        window.syncActiveContractReference?.(data.dossier.reference);
        window.showToast?.(`Dossier ${data.dossier.reference} abierto`, false, 'success');
    }

    async function updateStatus(id, status) {
        const data = await request(`/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        if (state.activeId === id) state.activeStatus = data.dossier.status;
        await loadList();
    }

    function render() {
        const body = document.getElementById('dossiers-table-body');
        const count = document.getElementById('dossiers-count');
        if (!body) return;
        count.textContent = `${state.dossiers.length} expediente${state.dossiers.length === 1 ? '' : 's'}`;
        if (!state.dossiers.length) {
            body.innerHTML = '<tr><td colspan="7"><div class="dossiers-empty"><i class="fa-regular fa-folder-open text-3xl mb-3 block"></i><strong>No hay dossiers guardados</strong><p class="mt-1 text-xs">Guarda una estimación para iniciar el historial comercial.</p></div></td></tr>';
            return;
        }
        body.innerHTML = state.dossiers.map((dossier) => {
            const status = String(dossier.status || 'BORRADOR').toLowerCase();
            return `<tr>
                <td><div class="dossier-ref">${escapeHtml(dossier.reference)}</div><div class="text-[10px] text-slate-400 mt-1">${escapeHtml(dossier.id.slice(0, 8))}</div></td>
                <td><div class="dossier-route"><span>${escapeHtml(dossier.pol || 'POL')}</span><i class="fa-solid fa-arrow-right-long"></i><span>${escapeHtml(dossier.pod || 'POD')}</span></div></td>
                <td><div class="font-bold text-slate-700">${escapeHtml(dossier.cargoName || 'Sin especificar')}</div><div class="text-xs text-slate-500 mt-1">${Number(dossier.cargoVolume || 0).toLocaleString('es-ES')} MT</div></td>
                <td>${escapeHtml(dossier.charterer || 'Sin especificar')}</td>
                <td><div class="font-semibold text-slate-700">${formatDate(dossier.updatedAt)}</div><div class="text-[10px] text-slate-400 mt-1">Última actualización</div></td>
                <td><select class="dossier-status dossier-status--${status}" data-dossier-status="${dossier.id}">
                    <option value="BORRADOR" ${dossier.status === 'BORRADOR' ? 'selected' : ''}>Borrador</option>
                    <option value="COTIZADO" ${dossier.status === 'COTIZADO' ? 'selected' : ''}>Cotizado</option>
                    <option value="FIJADO" ${dossier.status === 'FIJADO' ? 'selected' : ''}>Fijado</option>
                </select></td>
                <td class="text-right"><button class="dossier-open" data-open-dossier="${dossier.id}"><i class="fa-solid fa-folder-open"></i>Abrir Dossier</button></td>
            </tr>`;
        }).join('');
    }

    async function loadList() {
        const body = document.getElementById('dossiers-table-body');
        if (body) body.innerHTML = '<tr><td colspan="7" class="dossiers-empty"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Cargando expedientes...</td></tr>';
        try {
            const data = await request(state.query ? `?q=${encodeURIComponent(state.query)}` : '');
            state.dossiers = data.dossiers || [];
            render();
        } catch (error) {
            if (body) body.innerHTML = `<tr><td colspan="7" class="dossiers-empty text-red-600">${escapeHtml(error.message)}</td></tr>`;
        }
    }

    function clearActive() {
        state.activeId = null;
        state.activeStatus = 'BORRADOR';
        state.activeClientName = '';
        state.activeInternalNotes = '';
        delete document.body.dataset.activeDossierId;
    }

    document.addEventListener('click', (event) => {
        const openButton = event.target.closest('[data-open-dossier]');
        if (openButton) openDossier(openButton.dataset.openDossier).catch((error) => window.showToast?.(error.message));
        if (event.target.closest('[data-close-dossier-modal]')) closeSaveModal();
        if (event.target.closest('[data-close-new-estimation-modal]')) closeNewEstimationModal();
        if (event.target.closest('#dossier-confirm-save')) confirmSave();
        if (event.target.closest('#new-estimation-save')) saveAndStartNewEstimation();
        if (event.target.closest('#new-estimation-discard')) discardAndStartNewEstimation();
    });
    document.addEventListener('change', (event) => {
        const select = event.target.closest('[data-dossier-status]');
        if (select) updateStatus(select.dataset.dossierStatus, select.value).catch((error) => window.showToast?.(error.message));
    });
    document.addEventListener('input', (event) => {
        if (event.target.id !== 'dossiers-search') return;
        state.query = event.target.value.trim();
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(loadList, 250);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (document.getElementById('new-estimation-modal')?.classList.contains('is-open')) closeNewEstimationModal();
        else if (document.getElementById('dossier-save-modal')?.classList.contains('is-open')) closeSaveModal();
    });

    window.DossierManager = { requestSave, requestNewEstimation, openDossier, loadList, clearActive };
})();
