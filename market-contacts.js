const CONTACT_ROLES = Object.freeze({
    ALL: 'Todos',
    BROKER: 'Brokers',
    OWNER: 'Armadores',
    SHIPMANAGEMENT: 'Shipmanagement',
    CHARTERER: 'Fletadores',
    AGENT: 'Agentes',
    LOGISTICS: 'Operadores'
});

const state = {
    contacts: [],
    search: '',
    role: 'ALL',
    loading: false,
    loaded: false,
    editingId: null,
    editingImos: [],
    expandedIds: new Set(),
    fleetCache: new Map(),
    fleetLoadingIds: new Set(),
    previousFocus: null,
    toastTimer: null
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function cleanImo(value) {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    return digits.length >= 6 && digits.length <= 8 ? digits : null;
}

function isOwnerOrManagerRole(role) {
    const r = String(role || '').toUpperCase();
    return r === 'OWNER' || r === 'SHIPMANAGEMENT';
}

function getElements() {
    return {
        shell: document.getElementById('market-directory-shell'),
        panel: document.getElementById('market-directory-panel'),
        list: document.getElementById('market-directory-list'),
        summary: document.getElementById('market-directory-summary'),
        search: document.getElementById('market-directory-search'),
        editor: document.getElementById('market-contact-editor'),
        form: document.getElementById('market-contact-form'),
        formError: document.getElementById('market-contact-form-error'),
        tagsList: document.getElementById('market-contact-tags-list'),
        imoInput: document.getElementById('market-contact-imo-input'),
        tagsBox: document.getElementById('market-contact-tags-box'),
        toast: document.getElementById('market-directory-toast')
    };
}

function createDirectory() {
    if (document.getElementById('market-directory-shell')) return;
    const shell = document.createElement('div');
    shell.id = 'market-directory-shell';
    shell.className = 'market-directory-shell no-print';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-labelledby', 'market-directory-title');
    shell.setAttribute('aria-hidden', 'true');
    shell.innerHTML = `
        <section id="market-directory-panel" class="market-directory-panel" tabindex="-1">
            <header class="market-directory-header">
                <div class="market-directory-heading">
                    <div class="market-directory-mark"><i class="fa-solid fa-address-book" aria-hidden="true"></i></div>
                    <div>
                        <h2 id="market-directory-title" class="market-directory-title">Agenda de Brokers</h2>
                        <p class="market-directory-kicker">Directorio comercial marítimo · Core PRO</p>
                    </div>
                </div>
                <div class="market-directory-header-actions">
                    <button type="button" class="market-directory-button market-directory-button--primary" data-directory-action="new">
                        <i class="fa-solid fa-user-plus" aria-hidden="true"></i><span>Nuevo contacto</span>
                    </button>
                    <button type="button" class="market-directory-icon-button" data-directory-action="close" aria-label="Cerrar agenda">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </div>
            </header>
            <div class="market-directory-toolbar">
                <label class="market-directory-search" for="market-directory-search">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    <input id="market-directory-search" type="search" autocomplete="off" placeholder="Buscar empresa, broker, armador, IMO o país…">
                </label>
                <div class="market-directory-filters" role="group" aria-label="Filtrar por categoría">
                    ${Object.entries(CONTACT_ROLES).map(([role, label]) => `
                        <button type="button" class="market-directory-filter${role === 'ALL' ? ' is-active' : ''}" data-role="${role}">${label}</button>
                    `).join('')}
                </div>
            </div>
            <main class="market-directory-body">
                <div id="market-directory-summary" class="market-directory-summary"></div>
                <div id="market-directory-list"></div>
            </main>
            <div id="market-contact-editor" class="market-contact-editor" role="dialog" aria-modal="true" aria-labelledby="market-contact-editor-title" hidden>
                <div class="market-contact-editor-card">
                    <header class="market-contact-editor-header">
                        <div>
                            <h3 id="market-contact-editor-title">Nuevo contacto</h3>
                            <p>Actualiza la información disponible durante la negociación.</p>
                        </div>
                        <button type="button" class="market-directory-icon-button market-contact-editor-close" data-directory-action="close-editor" aria-label="Cerrar formulario">
                            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                        </button>
                    </header>
                    <form id="market-contact-form" class="market-contact-form">
                        <div class="market-contact-field">
                            <label for="market-contact-company">Empresa <span>*</span></label>
                            <input id="market-contact-company" name="company_name" maxlength="180" required>
                        </div>
                        <div class="market-contact-field">
                            <label for="market-contact-name">Persona de contacto</label>
                            <input id="market-contact-name" name="contact_name" maxlength="180">
                        </div>
                        <div class="market-contact-field">
                            <label for="market-contact-role">Categoría <span>*</span></label>
                            <select id="market-contact-role" name="contact_role" required>
                                <option value="BROKER">Broker</option>
                                <option value="OWNER">Armador</option>
                                <option value="SHIPMANAGEMENT">Shipmanagement</option>
                                <option value="CHARTERER">Fletador</option>
                                <option value="AGENT">Agente</option>
                                <option value="LOGISTICS">Operador logístico</option>
                            </select>
                        </div>
                        <div class="market-contact-field">
                            <label for="market-contact-country">País / mercado</label>
                            <input id="market-contact-country" name="country" maxlength="100">
                        </div>
                        <div class="market-contact-field market-contact-field--wide">
                            <label for="market-contact-emails">Emails <span>*</span></label>
                            <textarea id="market-contact-emails" name="emails" required placeholder="operations@empresa.com, broker@empresa.com"></textarea>
                            <small>Separa varios correos con comas o saltos de línea.</small>
                        </div>
                        <div class="market-contact-field market-contact-field--wide">
                            <label for="market-contact-phones">Teléfonos</label>
                            <textarea id="market-contact-phones" name="phones" placeholder="+34 600 000 000, +44 20 0000 0000"></textarea>
                            <small>Separa varios teléfonos con comas o saltos de línea.</small>
                        </div>
                        <div class="market-contact-field market-contact-field--wide" id="market-contact-imos-field">
                            <label for="market-contact-imo-input">
                                Buques vinculados (Números IMO)
                                <span class="market-contact-label-tag">Flota gestionada / Armador</span>
                            </label>
                            <div id="market-contact-tags-box" class="market-contact-tags-box" tabindex="-1">
                                <div id="market-contact-tags-list" class="market-contact-tags-list" role="list"></div>
                                <input id="market-contact-imo-input" type="text" placeholder="Escribe o pega nº IMO y pulsa Enter o coma…" autocomplete="off" inputmode="numeric">
                            </div>
                            <small>Introduce los números IMO (7 dígitos) operados por la empresa. Puedes pegar varios números a la vez separados por comas, espacios o saltos de línea.</small>
                        </div>
                        <div class="market-contact-field market-contact-field--wide">
                            <label for="market-contact-notes">Notas comerciales</label>
                            <textarea id="market-contact-notes" name="notes" maxlength="2000" placeholder="Disponibilidad, zonas habituales, preferencias operativas…"></textarea>
                        </div>
                        <div id="market-contact-form-error" class="market-contact-form-error" role="alert" hidden></div>
                        <div class="market-contact-form-actions">
                            <button type="button" class="market-directory-button market-directory-button--quiet" data-directory-action="close-editor">Cancelar</button>
                            <button type="submit" class="market-directory-button market-directory-button--save">
                                <i class="fa-solid fa-check" aria-hidden="true"></i><span>Guardar contacto</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            <div id="market-directory-toast" class="market-directory-toast" role="status" aria-live="polite"></div>
        </section>`;
    document.body.appendChild(shell);
    bindDirectoryEvents();
}

function splitValues(value) {
    return [...new Set(String(value ?? '').split(/[\n,;]+/).map(item => item.trim()).filter(Boolean))];
}

function roleLabel(role) {
    return CONTACT_ROLES[role] || role || 'Sin categoría';
}

function renderImoTags() {
    const { tagsList } = getElements();
    if (!tagsList) return;
    if (state.editingImos.length === 0) {
        tagsList.innerHTML = '';
        return;
    }
    tagsList.innerHTML = state.editingImos.map(imo => `
        <span class="market-contact-tag" role="listitem">
            <i class="fa-solid fa-ship" aria-hidden="true"></i>
            <span class="market-contact-tag-label">IMO ${escapeHtml(imo)}</span>
            <button type="button" class="market-contact-tag-remove" data-remove-imo="${escapeHtml(imo)}" aria-label="Eliminar IMO ${escapeHtml(imo)}" title="Eliminar">&times;</button>
        </span>
    `).join('');
}

function addImosFromText(rawText) {
    if (!rawText) return;
    const tokens = String(rawText).split(/[\s,;]+/);
    let addedCount = 0;
    tokens.forEach(token => {
        const cleaned = cleanImo(token);
        if (cleaned && !state.editingImos.includes(cleaned)) {
            state.editingImos.push(cleaned);
            addedCount++;
        }
    });
    if (addedCount > 0) {
        renderImoTags();
    }
}

function removeImoTag(imo) {
    state.editingImos = state.editingImos.filter(item => item !== imo);
    renderImoTags();
}

function filteredContacts() {
    const search = state.search.trim().toLocaleLowerCase('es');
    return state.contacts.filter(contact => {
        if (state.role !== 'ALL' && contact.contact_role !== state.role) return false;
        if (!search) return true;
        const imos = Array.isArray(contact.linked_imos) ? contact.linked_imos : [];
        return [contact.company_name, contact.contact_name, contact.country, ...imos]
            .some(value => String(value || '').toLocaleLowerCase('es').includes(search));
    });
}

async function fetchFleetForContact(contact) {
    const imos = Array.isArray(contact.linked_imos) ? contact.linked_imos : [];
    if (imos.length === 0) {
        state.fleetCache.set(contact.id, []);
        renderDirectory();
        return;
    }
    if (state.fleetCache.has(contact.id) || state.fleetLoadingIds.has(contact.id)) return;

    state.fleetLoadingIds.add(contact.id);
    renderDirectory();

    try {
        const baseUrl = typeof window !== 'undefined' && window.getApiUrl ? window.getApiUrl('/api/market-contacts') : '/api/market-contacts';
        const url = `${baseUrl}?action=fleet&imos=${encodeURIComponent(imos.join(','))}`;
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            throw new Error(data.error || 'Error al consultar flota.');
        }
        state.fleetCache.set(contact.id, Array.isArray(data.fleet) ? data.fleet : []);
    } catch (err) {
        console.warn('[market-contacts] No se pudo obtener la flota vinculada:', err);
        state.fleetCache.set(contact.id, []);
    } finally {
        state.fleetLoadingIds.delete(contact.id);
        renderDirectory();
    }
}

function toggleContactDetails(contactId) {
    const contact = state.contacts.find(item => item.id === contactId);
    if (!contact) return;
    if (state.expandedIds.has(contactId)) {
        state.expandedIds.delete(contactId);
        renderDirectory();
    } else {
        state.expandedIds.add(contactId);
        if (isOwnerOrManagerRole(contact.contact_role) || (Array.isArray(contact.linked_imos) && contact.linked_imos.length > 0)) {
            fetchFleetForContact(contact);
        } else {
            renderDirectory();
        }
    }
}

function renderDirectory() {
    const { list, summary } = getElements();
    if (!list || !summary) return;

    if (state.loading) {
        summary.innerHTML = '<span>Consultando la agenda comercial…</span>';
        list.innerHTML = `<div aria-label="Cargando contactos">${Array.from({ length: 6 }, () => '<div class="market-directory-skeleton"></div>').join('')}</div>`;
        return;
    }

    const contacts = filteredContacts();
    summary.innerHTML = `<span><strong>${contacts.length}</strong> ${contacts.length === 1 ? 'contacto visible' : 'contactos visibles'}</span><span>${state.contacts.length} en la agenda</span>`;

    if (contacts.length === 0) {
        const hasFilters = Boolean(state.search || state.role !== 'ALL');
        list.innerHTML = `
            <div class="market-directory-state">
                <div class="market-directory-state-card">
                    <div class="market-directory-state-icon"><i class="fa-solid ${hasFilters ? 'fa-magnifying-glass' : 'fa-address-card'}"></i></div>
                    <h3>${hasFilters ? 'No hay coincidencias' : 'La agenda está vacía'}</h3>
                    <p>${hasFilters ? 'Prueba otra búsqueda o selecciona una categoría distinta.' : 'Añade el primer broker, armador, fletador u operador para iniciar el directorio.'}</p>
                </div>
            </div>`;
        return;
    }

    list.innerHTML = `
        <div class="market-directory-table-wrap">
            <table class="market-directory-table">
                <thead><tr>
                    <th style="width:23%">Empresa</th>
                    <th style="width:16%">Contacto</th>
                    <th style="width:22%">Emails</th>
                    <th style="width:16%">Teléfonos</th>
                    <th style="width:13%">Categoría</th>
                    <th style="width:10%;text-align:right">Acciones</th>
                </tr></thead>
                <tbody>${contacts.map(renderContactRowGroup).join('')}</tbody>
            </table>
        </div>`;
}

function renderContactRowGroup(contact) {
    const isExpanded = state.expandedIds.has(contact.id);
    const mainRow = renderContactRow(contact, isExpanded);
    if (!isExpanded) return mainRow;
    const detailRow = renderContactDetailRow(contact);
    return mainRow + detailRow;
}

function renderContactRow(contact, isExpanded = false) {
    const emails = Array.isArray(contact.emails) ? contact.emails : [];
    const phones = Array.isArray(contact.phones) ? contact.phones : [];
    const primaryPhone = phones[0] || '';
    const primaryEmail = emails[0] || '';
    const imos = Array.isArray(contact.linked_imos) ? contact.linked_imos : [];
    const hasFleet = isOwnerOrManagerRole(contact.contact_role) || imos.length > 0;

    return `
        <tr class="market-directory-main-row${isExpanded ? ' is-expanded' : ''}" data-contact-id="${escapeHtml(contact.id)}">
            <td>
                <div class="market-directory-company-wrapper">
                    <span class="market-directory-company">${escapeHtml(contact.company_name)}</span>
                    <span class="market-directory-country">${contact.country ? `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(contact.country)}` : 'Mercado no indicado'}</span>
                    ${hasFleet ? `
                        <button type="button" class="market-directory-fleet-pill-badge" data-toggle-details="${escapeHtml(contact.id)}" title="${isExpanded ? 'Ocultar flota gestionada' : 'Ver buques de la flota gestionada'}">
                            <i class="fa-solid fa-ship"></i>
                            <span>${imos.length} ${imos.length === 1 ? 'buque vinculado' : 'buques vinculados'}</span>
                            <i class="fa-solid fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
            <td>${contact.contact_name ? `<span class="market-directory-contact-name">${escapeHtml(contact.contact_name)}</span>` : '<span class="market-directory-empty-value">Sin persona asignada</span>'}</td>
            <td><div class="market-directory-stack">${emails.map(email => `<a class="market-directory-link" href="mailto:${encodeURIComponent(email)}"><i class="fa-regular fa-envelope"></i>${escapeHtml(email)}</a>`).join('') || '<span class="market-directory-empty-value">Sin email</span>'}</div></td>
            <td><div class="market-directory-stack">${phones.map(phone => `<span>${escapeHtml(phone)}</span>`).join('') || '<span class="market-directory-empty-value">Sin teléfono</span>'}</div></td>
            <td><span class="market-directory-role">${escapeHtml(roleLabel(contact.contact_role))}</span></td>
            <td>
                <div class="market-directory-row-actions">
                    <button type="button" class="market-directory-row-action market-directory-row-action--toggle${isExpanded ? ' is-active' : ''}" data-toggle-details="${escapeHtml(contact.id)}" aria-label="${isExpanded ? 'Ocultar detalles y flota' : 'Ver detalles y flota'}" title="${isExpanded ? 'Ocultar detalles y flota' : 'Ver detalles y flota'}" aria-expanded="${isExpanded ? 'true' : 'false'}">
                        <i class="fa-solid fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
                    </button>
                    <button type="button" class="market-directory-row-action" data-copy-phone="${escapeHtml(primaryPhone)}" aria-label="Copiar teléfono" title="Copiar teléfono" ${primaryPhone ? '' : 'disabled'}><i class="fa-regular fa-copy"></i></button>
                    <a class="market-directory-row-action" href="${primaryEmail ? `mailto:${encodeURIComponent(primaryEmail)}` : '#'}" aria-label="Enviar email" title="Enviar email" ${primaryEmail ? '' : 'aria-disabled="true"'}><i class="fa-regular fa-envelope"></i></a>
                    <button type="button" class="market-directory-row-action" data-edit-contact="${escapeHtml(contact.id)}" aria-label="Editar contacto" title="Editar contacto"><i class="fa-solid fa-pen"></i></button>
                </div>
            </td>
        </tr>`;
}

function renderContactDetailRow(contact) {
    const isOwnerOrManager = isOwnerOrManagerRole(contact.contact_role);
    const imos = Array.isArray(contact.linked_imos) ? contact.linked_imos : [];
    const showFleet = isOwnerOrManager || imos.length > 0;

    return `
        <tr class="market-directory-detail-row" data-detail-id="${escapeHtml(contact.id)}">
            <td colspan="6">
                <div class="market-directory-detail-content">
                    ${showFleet ? `
                        <section class="market-directory-fleet-section" aria-label="Flota Gestionada">
                            <div class="market-directory-fleet-header">
                                <div class="market-directory-fleet-heading">
                                    <div class="market-directory-fleet-icon"><i class="fa-solid fa-ship" aria-hidden="true"></i></div>
                                    <h4 class="market-directory-fleet-title">Flota Gestionada</h4>
                                    <span class="market-directory-fleet-count-tag">${imos.length} ${imos.length === 1 ? 'buque registrado' : 'buques registrados'}</span>
                                    ${isOwnerOrManager ? `<span class="market-directory-fleet-role-tag">${escapeHtml(roleLabel(contact.contact_role))}</span>` : ''}
                                </div>
                                <button type="button" class="market-directory-fleet-edit-btn" data-edit-contact="${escapeHtml(contact.id)}">
                                    <i class="fa-solid fa-pen-to-square"></i><span>Vincular / editar buques</span>
                                </button>
                            </div>
                            <div class="market-directory-fleet-body">
                                ${renderFleetCards(contact)}
                            </div>
                        </section>
                    ` : ''}
                    ${contact.notes ? `
                        <div class="market-directory-detail-notes">
                            <span class="market-directory-detail-notes-title"><i class="fa-regular fa-clipboard"></i> Notas comerciales</span>
                            <p class="market-directory-detail-notes-body">${escapeHtml(contact.notes)}</p>
                        </div>
                    ` : ''}
                </div>
            </td>
        </tr>`;
}

function renderFleetCards(contact) {
    const imos = Array.isArray(contact.linked_imos) ? contact.linked_imos : [];
    if (state.fleetLoadingIds.has(contact.id)) {
        return `
            <div class="market-fleet-loading">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                <span>Consultando flota maestra (vessels_master en Neon DB)…</span>
            </div>`;
    }

    if (imos.length === 0) {
        return `
            <div class="market-fleet-empty">
                <i class="fa-solid fa-anchor"></i>
                <div>
                    <strong>Sin buques vinculados actualmente.</strong>
                    <p>Haz clic en "Vincular / editar buques" para agregar números IMO a la flota de ${escapeHtml(contact.company_name)}.</p>
                </div>
            </div>`;
    }

    const masterFleet = state.fleetCache.get(contact.id) || [];
    const masterMap = new Map();
    masterFleet.forEach(v => {
        const cleanNumber = String(v.imo_number ?? '').replace(/[^0-9]/g, '');
        if (cleanNumber) masterMap.set(cleanNumber, v);
    });

    return `
        <div class="market-fleet-cards-grid">
            ${imos.map(imo => {
                const vessel = masterMap.get(imo);
                if (vessel) {
                    const vesselName = vessel.vessel_name || 'Buque';
                    const vesselImo = vessel.imo_number || imo;
                    const vesselType = vessel.vessel_type;
                    const dwt = vessel.dwt ? `${Number(vessel.dwt).toLocaleString('es-ES')} DWT` : null;
                    const flag = vessel.flag && vessel.flag !== 'N/A' ? vessel.flag : null;
                    const year = vessel.year_built ? `Año ${vessel.year_built}` : null;
                    return `
                        <article class="market-fleet-card" title="Nombre del Buque: ${escapeHtml(vesselName)} · IMO: ${escapeHtml(vesselImo)}${dwt ? ` · ${dwt}` : ''}${vesselType ? ` · ${escapeHtml(vesselType)}` : ''}">
                            <div class="market-fleet-card-icon"><i class="fa-solid fa-ship"></i></div>
                            <div class="market-fleet-card-info">
                                <span class="market-fleet-card-name">${escapeHtml(vesselName)}</span>
                                <span class="market-fleet-card-imo">(${escapeHtml(vesselImo)})</span>
                            </div>
                            <div class="market-fleet-card-tags">
                                ${dwt ? `<span class="market-fleet-card-dwt">${escapeHtml(dwt)}</span>` : ''}
                                ${vesselType ? `<span class="market-fleet-card-type">${escapeHtml(vesselType)}</span>` : ''}
                                ${flag ? `<span class="market-fleet-card-flag" title="Bandera: ${escapeHtml(flag)}">${escapeHtml(flag)}</span>` : ''}
                                ${year ? `<span class="market-fleet-card-year">${escapeHtml(year)}</span>` : ''}
                            </div>
                        </article>`;
                }
                return `
                    <article class="market-fleet-card market-fleet-card--unmatched" title="Buque IMO ${escapeHtml(imo)} pendiente de registro en flota maestra">
                        <div class="market-fleet-card-icon"><i class="fa-regular fa-circle-question"></i></div>
                        <div class="market-fleet-card-info">
                            <span class="market-fleet-card-name">Buque</span>
                            <span class="market-fleet-card-imo">(${escapeHtml(imo)})</span>
                        </div>
                        <span class="market-fleet-card-badge-unmatched">No indexado</span>
                    </article>`;
            }).join('')}
        </div>`;
}

async function loadContacts(force = false) {
    if (state.loading || (state.loaded && !force)) return;
    state.loading = true;
    renderDirectory();
    try {
        const response = await fetch((typeof window !== 'undefined' && window.getApiUrl ? window.getApiUrl('/api/market-contacts') : '/api/market-contacts'), { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) throw new Error(payload.error || 'No se pudo cargar la agenda.');
        state.contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
        state.loaded = true;
    } catch (error) {
        showToast(error.message || 'No se pudo cargar la agenda.', true);
        state.contacts = [];
    } finally {
        state.loading = false;
        renderDirectory();
    }
}

function openDirectory() {
    createDirectory();
    const { shell, panel, search } = getElements();
    state.previousFocus = document.activeElement;
    shell?.classList.add('is-open');
    shell?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => (search || panel)?.focus(), 50);
    loadContacts();
}

function closeDirectory() {
    const { shell, editor } = getElements();
    if (!shell || !shell.classList.contains('is-open')) return;
    if (editor && !editor.hidden) {
        closeEditor();
        return;
    }
    shell.classList.remove('is-open');
    shell.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (state.previousFocus instanceof HTMLElement) state.previousFocus.focus();
}

function openEditor(contact = null) {
    const { editor, form, formError, imoInput } = getElements();
    if (!editor || !form) return;
    state.editingId = contact?.id || null;
    state.editingImos = Array.isArray(contact?.linked_imos) ? [...contact.linked_imos] : [];
    document.getElementById('market-contact-editor-title').textContent = contact ? 'Editar contacto' : 'Nuevo contacto';
    form.reset();
    form.elements.company_name.value = contact?.company_name || '';
    form.elements.contact_name.value = contact?.contact_name || '';
    form.elements.contact_role.value = contact?.contact_role || 'BROKER';
    form.elements.country.value = contact?.country || '';
    form.elements.emails.value = (contact?.emails || []).join('\n');
    form.elements.phones.value = (contact?.phones || []).join('\n');
    form.elements.notes.value = contact?.notes || '';
    renderImoTags();
    if (imoInput) imoInput.value = '';
    if (formError) formError.hidden = true;
    editor.hidden = false;
    editor.scrollTop = 0;
    form.scrollTop = 0;
    const editorCard = editor.querySelector('.market-contact-editor-card');
    if (editorCard) editorCard.scrollTop = 0;
    window.setTimeout(() => form.elements.company_name.focus(), 30);
}

function closeEditor() {
    const { editor, formError } = getElements();
    if (editor) editor.hidden = true;
    if (formError) formError.hidden = true;
    state.editingId = null;
    state.editingImos = [];
}

async function submitContact(event) {
    event.preventDefault();
    const { form, formError, imoInput } = getElements();
    if (!form) return;
    if (imoInput && imoInput.value.trim()) {
        addImosFromText(imoInput.value);
        imoInput.value = '';
    }
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const wasEditing = Boolean(state.editingId);
    const payload = {
        id: state.editingId,
        company_name: formData.get('company_name'),
        contact_name: formData.get('contact_name'),
        contact_role: formData.get('contact_role'),
        country: formData.get('country'),
        emails: splitValues(formData.get('emails')),
        phones: splitValues(formData.get('phones')),
        notes: formData.get('notes'),
        linked_imos: [...state.editingImos]
    };

    if (formError) formError.hidden = true;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Guardando…</span>';
    }

    try {
        const response = await fetch((typeof window !== 'undefined' && window.getApiUrl ? window.getApiUrl('/api/market-contacts') : '/api/market-contacts'), {
            method: state.editingId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.error || 'No se pudo guardar el contacto.');
        const contact = result.contact;
        const index = state.contacts.findIndex(item => item.id === contact.id);
        if (index >= 0) state.contacts[index] = contact;
        else state.contacts.push(contact);
        state.contacts.sort((a, b) => String(a.company_name).localeCompare(String(b.company_name), 'es'));

        // Invalidate cached fleet for this contact
        state.fleetCache.delete(contact.id);
        if (state.expandedIds.has(contact.id)) {
            fetchFleetForContact(contact);
        }

        closeEditor();
        renderDirectory();
        showToast(wasEditing ? 'Contacto actualizado.' : 'Contacto añadido a la agenda.');
    } catch (error) {
        if (formError) {
            formError.textContent = error.message || 'No se pudo guardar el contacto.';
            formError.hidden = false;
        }
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fa-solid fa-check"></i><span>Guardar contacto</span>';
        }
    }
}

async function copyPhone(phone) {
    if (!phone) return;
    try {
        await navigator.clipboard.writeText(phone);
        showToast(`Teléfono copiado: ${phone}`);
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = phone;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        showToast(`Teléfono copiado: ${phone}`);
    }
}

function showToast(message, isError = false) {
    const { toast } = getElements();
    if (!toast) return;
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function bindDirectoryEvents() {
    const { shell, search, form, tagsBox, imoInput } = getElements();
    shell?.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target === shell) closeDirectory();
        const action = target.closest('[data-directory-action]')?.dataset.directoryAction;
        if (action === 'close') closeDirectory();
        if (action === 'new') openEditor();
        if (action === 'close-editor') closeEditor();

        const filter = target.closest('[data-role]');
        if (filter) {
            state.role = filter.dataset.role || 'ALL';
            shell.querySelectorAll('[data-role]').forEach(item => item.classList.toggle('is-active', item === filter));
            renderDirectory();
        }

        const editButton = target.closest('[data-edit-contact]');
        if (editButton) {
            const contact = state.contacts.find(item => item.id === editButton.dataset.editContact);
            if (contact) openEditor(contact);
        }

        const copyButton = target.closest('[data-copy-phone]');
        if (copyButton) copyPhone(copyButton.dataset.copyPhone);

        const toggleBtn = target.closest('[data-toggle-details]');
        if (toggleBtn) {
            event.stopPropagation();
            toggleContactDetails(toggleBtn.dataset.toggleDetails);
        }

        const removeTagBtn = target.closest('[data-remove-imo]');
        if (removeTagBtn) {
            event.stopPropagation();
            removeImoTag(removeTagBtn.dataset.removeImo);
        }
    });

    tagsBox?.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-remove-imo]')) return;
        imoInput?.focus();
    });

    imoInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            if (imoInput.value.trim()) {
                addImosFromText(imoInput.value);
                imoInput.value = '';
            }
        } else if (event.key === 'Backspace' && !imoInput.value) {
            if (state.editingImos.length > 0) {
                state.editingImos.pop();
                renderImoTags();
            }
        }
    });

    imoInput?.addEventListener('paste', event => {
        const pastedText = (event.clipboardData || window.clipboardData)?.getData('text');
        if (pastedText) {
            event.preventDefault();
            addImosFromText(pastedText);
            imoInput.value = '';
        }
    });

    imoInput?.addEventListener('blur', () => {
        if (imoInput.value.trim()) {
            addImosFromText(imoInput.value);
            imoInput.value = '';
        }
    });

    search?.addEventListener('input', event => {
        state.search = event.target.value || '';
        renderDirectory();
    });

    form?.addEventListener('submit', submitContact);
}

document.addEventListener('keydown', event => {
    const { shell } = getElements();
    if (!shell?.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeDirectory();
    }
});

window.openMarketContactsDirectory = openDirectory;
window.closeMarketContactsDirectory = closeDirectory;
