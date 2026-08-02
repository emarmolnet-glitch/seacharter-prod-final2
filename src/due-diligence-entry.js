import { fetchDueDiligence, persistDueDiligenceVessel } from './services/dueDiligenceService.js';
import { evaluateCargoVesselEligibility } from '../cargo-taxonomy.mjs';

(function initializeVesselDueDiligenceBridge(globalScope) {
    'use strict';

    const MISSING_TECHNICAL_PATTERN = /(dwt|deadweight).*(unknown|desconocid|missing|no disponible|pending)|(imo).*(unknown|desconocid|missing|no disponible|pending)/i;
    const NON_COMMERCIAL_VESSEL_PATTERN = /yacht|passenger|ferry|pleasure|cruise|military/i;
    const PROPOSAL_FIELDS = Object.freeze([
        { field: 'imo', label: 'IMO' },
        { field: 'dwt', label: 'DWT' },
        { field: 'flag', label: 'Bandera' },
        { field: 'vesselType', label: 'Tipo de buque' },
        { field: 'yearBuilt', label: 'Año de construcción' },
    ]);
    const pendingProposals = new Map();

    function readText(value) {
        return value === null || value === undefined ? '' : String(value).trim();
    }

    function normalizeImo(value) {
        const digits = readText(value).replace(/\D/g, '');
        return digits.length >= 7 ? digits.slice(-7) : '';
    }

    function normalizeMmsi(value) {
        const digits = readText(value).replace(/\D/g, '');
        return digits.length === 9 ? digits : '';
    }

    function readPositiveNumber(value) {
        const normalized = readText(value)
            .replace(/[^\d.,-]/g, '')
            .replace(/,(?=\d{3}(?:\D|$))/g, '')
            .replace(',', '.');
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    function readYear(value) {
        const match = readText(value).match(/\b(18|19|20)\d{2}\b/);
        return match ? Number(match[0]) : null;
    }

    function getMeta(vessel) {
        return vessel && vessel.MetaData && typeof vessel.MetaData === 'object' ? vessel.MetaData : {};
    }

    function vesselIdentityMatches(vessel, identity) {
        if (!vessel || typeof vessel !== 'object') return false;
        const meta = getMeta(vessel);
        const candidateImo = normalizeImo(vessel.imo || vessel.IMO || meta.imo || meta.IMO);
        const candidateMmsi = normalizeMmsi(vessel.mmsi || vessel.MMSI || meta.mmsi || meta.MMSI);
        const candidateName = readText(vessel.vesselName || vessel.vessel_name || vessel.name || vessel.nombre || vessel.ShipName || meta.ShipName).toLowerCase();
        const identityImo = normalizeImo(identity.imo);
        const identityMmsi = normalizeMmsi(identity.mmsi);
        const identityName = readText(identity.name).toLowerCase();
        if (identityImo && candidateImo === identityImo) return true;
        if (identityMmsi && candidateMmsi === identityMmsi) return true;
        return Boolean(identityName && candidateName === identityName);
    }

    function normalizeTechnicalRecord(record) {
        const meta = getMeta(record);
        return {
            imo: normalizeImo(record?.imo_number || record?.imo || record?.IMO || record?.numero_imo || meta.imo || meta.IMO),
            dwt: readPositiveNumber(record?.dwt || record?.DWT || record?.deadweight || meta.dwt || meta.DWT),
            flag: readText(record?.flag || record?.bandera || record?.country || meta.flag),
            vesselType: readText(record?.vesselType || record?.vessel_type || record?.shipType || record?.ship_type || record?.type || meta.vesselType || meta.vessel_type),
            yearBuilt: readYear(record?.yearBuilt || record?.builtYear || record?.year_built || record?.built_year || record?.anio || record?.ano_construccion || meta.yearBuilt),
            draft: readPositiveNumber(record?.draft || record?.calado || record?.draught || meta.draft || meta.Draft),
            sourceUrl: readText(record?.sourceUrl),
        };
    }

    function mergeNonEmptyRecords(baseRecord, externalRecord) {
        const merged = { ...(baseRecord && typeof baseRecord === 'object' ? baseRecord : {}) };
        if (!externalRecord || typeof externalRecord !== 'object') return merged;
        Object.entries(externalRecord).forEach(([field, value]) => {
            if (value === null || value === undefined) return;
            if (typeof value === 'string' && !value.trim()) return;
            merged[field] = value;
        });
        return merged;
    }

    function readExternalScrapeRecord(payload) {
        if (!payload || typeof payload !== 'object') return {};
        return payload.vessel
            || payload.record
            || payload.records?.[0]
            || payload.data?.vessel
            || payload.data?.record
            || payload.data?.records?.[0]
            || payload.data
            || payload.result?.vessel
            || payload.result
            || payload;
    }

    function mergeTechnicalFields(target, technical) {
        if (!target || typeof target !== 'object') return target;
        const meta = getMeta(target);
        if (technical.imo) {
            target.imo = technical.imo;
            target.IMO = technical.imo;
            meta.imo = technical.imo;
            meta.IMO = technical.imo;
        }
        if (technical.dwt) {
            target.dwt = technical.dwt;
            target.DWT = technical.dwt;
            target.dwtStatus = 'VERIFIED_BY_DATABRIDGE';
            meta.dwt = technical.dwt;
            meta.DWT = technical.dwt;
            meta.dwtStatus = 'VERIFIED_BY_DATABRIDGE';
        }
        if (technical.flag) {
            target.flag = technical.flag;
            target.bandera = technical.flag;
            meta.flag = technical.flag;
        }
        if (technical.vesselType) {
            target.vesselType = technical.vesselType;
            target.vessel_type = technical.vesselType;
            target.shipType = technical.vesselType;
            target.ship_type = technical.vesselType;
            meta.vesselType = technical.vesselType;
            meta.vessel_type = technical.vesselType;
        }
        if (technical.yearBuilt) {
            target.yearBuilt = technical.yearBuilt;
            target.builtYear = technical.yearBuilt;
            target.built_year = technical.yearBuilt;
            target.ano_construccion = technical.yearBuilt;
            meta.yearBuilt = technical.yearBuilt;
        }
        if (technical.draft) {
            target.draft = technical.draft;
            target.Draft = technical.draft;
            target.calado = technical.draft;
            meta.draft = technical.draft;
            meta.Draft = technical.draft;
        }
        target.MetaData = meta;
        target.dueDiligenceStatus = 'HYDRATED';
        target.dueDiligenceAt = new Date().toISOString();
        target.audit_status = 'PENDING';
        target.auditStatus = 'PENDING';
        target.process_status = 'PENDING_REVIEW';
        target.processStatus = 'PENDING_REVIEW';
        target.source_provenance = 'due_diligence_manual';
        target.sourceProvenance = 'due_diligence_manual';
        return target;
    }

    function cleanMissingTechnicalWarnings(match) {
        if (!match || typeof match !== 'object') return;
        const technicalEligibility = match.technicalEligibility && typeof match.technicalEligibility === 'object'
            ? match.technicalEligibility
            : null;
        if (technicalEligibility && Array.isArray(technicalEligibility.criticalReasons)) {
            technicalEligibility.criticalReasons = technicalEligibility.criticalReasons.filter(reason => !MISSING_TECHNICAL_PATTERN.test(readText(reason)));
        }
        if (match.audit && Array.isArray(match.audit.reasons)) {
            match.audit.reasons = match.audit.reasons.filter(reason => !MISSING_TECHNICAL_PATTERN.test(readText(reason)));
        }
        const remainingReasons = technicalEligibility?.criticalReasons?.length || 0;
        if (remainingReasons === 0) {
            match.hasTechnicalWarning = false;
            match.hasWarning = false;
            if (match.vessel) {
                match.vessel.hasTechnicalWarning = false;
                match.vessel.hasWarning = false;
            }
        }
    }

    function reevaluateTechnicalMatch(match) {
        if (!match || typeof match !== 'object') return null;
        const vessel = match.vessel && typeof match.vessel === 'object' ? match.vessel : match;
        const previousEligibility = match.technicalEligibility && typeof match.technicalEligibility === 'object'
            ? match.technicalEligibility
            : {};
        const compatibility = match.compatibility && typeof match.compatibility === 'object'
            ? match.compatibility
            : {};
        const equipment = previousEligibility.equipment && typeof previousEligibility.equipment === 'object'
            ? previousEligibility.equipment
            : {};
        const requiredDwt = Number(previousEligibility.dwt?.required)
            || Number(globalScope.GlobalStore?.matchingRequest?.cargo?.quantity)
            || Number(globalScope.GlobalStore?.matchingRequest?.quantity)
            || 0;
        const technicalEligibility = evaluateCargoVesselEligibility({
            cargoTypeId: previousEligibility.cargoTypeId || globalScope.GlobalStore?.matchingRequest?.cargo?.typeId || '100',
            vessel,
            shipType: compatibility.declaredVesselType || vessel.vesselType || vessel.vessel_type || vessel.vesselClass,
            dwt: Number(vessel.dwt) || null,
            quantity: requiredDwt,
            requiredVolumeCbm: Number(previousEligibility.volume?.requiredCbm) || 0,
            gearedRequired: equipment.gearedRequired === true,
            grabRequired: equipment.grabRequired === true,
            requiredGrabCapacityCbm: Number(equipment.requiredGrabCapacityCbm) || 0,
            requiredCraneSwlMt: Number(equipment.requiredCraneSwlMt) || 0,
            draftOk: compatibility.draftOk !== false,
            loaOk: compatibility.loaOk !== false,
            dateOk: compatibility.dateOk !== false,
            maxDwtTolerance: requiredDwt > 0 && previousEligibility.dwt?.maximumSuitable
                ? Number(previousEligibility.dwt.maximumSuitable) / requiredDwt
                : 1.15,
        });
        const capacityOk = technicalEligibility.dwt.vessel !== null
            && technicalEligibility.dwt.vessel >= technicalEligibility.dwt.required
            && (technicalEligibility.dwt.maximumSuitable === null || technicalEligibility.dwt.vessel <= technicalEligibility.dwt.maximumSuitable);
        const dwtAssessment = technicalEligibility.dwt.vessel === null
            ? { status: 'UNKNOWN', label: 'DWT Desconocido' }
            : technicalEligibility.dwt.required > 0 && technicalEligibility.dwt.vessel < technicalEligibility.dwt.required
                ? { status: 'INSUFFICIENT', label: 'DWT Insuficiente' }
                : { status: 'SUFFICIENT', label: 'DWT Validado' };
        const previousCriticalReasons = Array.isArray(previousEligibility.criticalReasons)
            ? previousEligibility.criticalReasons
            : [];
        const retainedAuditReasons = Array.isArray(match.audit?.reasons)
            ? match.audit.reasons.filter(reason => !previousCriticalReasons.includes(reason) && !MISSING_TECHNICAL_PATTERN.test(readText(reason)))
            : [];

        match.technicalEligibility = technicalEligibility;
        match.dwtAssessment = dwtAssessment;
        match.dwtStatus = 'VERIFIED_BY_DATABRIDGE';
        match.hasTechnicalWarning = technicalEligibility.hasTechnicalWarning;
        match.hasWarning = technicalEligibility.hasWarning;
        match.warning = technicalEligibility.warning;
        match.warningReason = technicalEligibility.warning;
        match.compatibility = {
            ...compatibility,
            capacityOk,
            dwtAssessment,
            reasons: {
                ...(compatibility.reasons || {}),
                capacity: capacityOk ? 'OK' : technicalEligibility.criticalReasons.find(reason => /DWT|capacidad/i.test(reason)) || 'Capacidad no compatible',
            },
        };
        match.audit = {
            ...(match.audit || {}),
            operationallyEligible: compatibility.taxonomyCompatible !== false && technicalEligibility.eligible,
            reasons: [...retainedAuditReasons, ...technicalEligibility.criticalReasons],
        };
        if (match.vessel) {
            match.vessel.dwtAssessment = dwtAssessment;
            match.vessel.hasTechnicalWarning = technicalEligibility.hasTechnicalWarning;
            match.vessel.hasWarning = technicalEligibility.hasWarning;
        }
        return technicalEligibility;
    }

    function mergeMatch(match, identity, technical) {
        if (!match || typeof match !== 'object') return false;
        const vessel = match.vessel && typeof match.vessel === 'object' ? match.vessel : match;
        const ais = match.ais && typeof match.ais === 'object' ? match.ais : null;
        if (!vesselIdentityMatches(vessel, identity) && !vesselIdentityMatches(ais, identity) && !vesselIdentityMatches(match, identity)) return false;
        mergeTechnicalFields(vessel, technical);
        mergeTechnicalFields(ais, technical);
        if (technical.imo) match.imo = technical.imo;
        if (technical.dwt) {
            match.dwt = technical.dwt;
            match.dwtStatus = 'VERIFIED_BY_DATABRIDGE';
            match.dwtAssessment = {
                ...(match.dwtAssessment || {}),
                status: 'SUFFICIENT',
                source: 'DATABRIDGE_DUE_DILIGENCE',
            };
        }
        match.dueDiligenceStatus = 'HYDRATED';
        match.dueDiligenceAt = new Date().toISOString();
        cleanMissingTechnicalWarnings(match);
        reevaluateTechnicalMatch(match);
        return true;
    }

    function mergeCollection(collection, identity, technical, isMatchingCollection) {
        if (!Array.isArray(collection)) return 0;
        return collection.reduce((count, item) => {
            const merged = isMatchingCollection
                ? mergeMatch(item, identity, technical)
                : vesselIdentityMatches(item, identity) && Boolean(mergeTechnicalFields(item, technical));
            return count + (merged ? 1 : 0);
        }, 0);
    }

    function refreshMatchingDerivedState() {
        const matchingState = globalScope.matchingResultsState;
        if (!matchingState || !Array.isArray(matchingState.vessels)) return;
        matchingState.eligibleVessels = matchingState.vessels.filter(match => match?.audit?.operationallyEligible === true);
        matchingState.eligibleCount = matchingState.eligibleVessels.length;
        matchingState.technicalWarningCount = matchingState.vessels.filter(match => match?.hasTechnicalWarning === true || match?.hasWarning === true).length;
        matchingState.cachedAt = new Date().toISOString();
        if (globalScope.GlobalStore) {
            globalScope.GlobalStore.matchingVessels = matchingState.vessels.slice();
            globalScope.GlobalStore.compatibleVessels = matchingState.eligibleVessels.map(match => ({
                imo: match?.vessel?.imo || '',
                vesselName: match?.vessel?.vesselName || match?.vessel?.vessel_name || '',
            }));
        }
    }

    function hydrateStores(identity, technical) {
        let hydratedMatch = null;
        if (globalScope.GlobalStore) {
            const dueDiligenceVessel = {
                ...identity,
                ...technical,
                imo: technical.imo || identity.imo || '',
                imo_number: technical.imo || identity.imo || '',
                vesselName: identity.name || identity.vesselName || '',
                vessel_name: identity.name || identity.vesselName || '',
                mmsi: identity.mmsi || '',
                yearBuilt: technical.yearBuilt || null,
                year_built: technical.yearBuilt || null,
                built_year: technical.yearBuilt || null,
                vesselType: technical.vesselType || '',
                vessel_type: technical.vesselType || '',
                auditStatus: 'PENDING',
                audit_status: 'PENDING',
                source: 'openships_validated',
                source_provenance: 'due_diligence_manual',
            };
            const storedVessels = Array.isArray(globalScope.GlobalStore.dueDiligenceVessels)
                ? globalScope.GlobalStore.dueDiligenceVessels
                : [];
            const existingIndex = storedVessels.findIndex(vessel => vesselIdentityMatches(vessel, identity));
            if (existingIndex >= 0) storedVessels[existingIndex] = mergeNonEmptyRecords(storedVessels[existingIndex], dueDiligenceVessel);
            else storedVessels.push(dueDiligenceVessel);
            globalScope.GlobalStore.dueDiligenceVessels = storedVessels;
        }
        const matchingCollections = [
            globalScope.lastMatchingEngineResults,
            globalScope.matchingResultsState?.vessels,
            globalScope.matchingResultsState?.eligibleVessels,
            globalScope.GlobalStore?.matchingVessels,
        ];
        const vesselCollections = [
            globalScope.openShipsVesselsCache,
            globalScope.GlobalStore?.rawVessels,
            globalScope.GlobalStore?.vessels,
            globalScope.GlobalStore?.filteredVessels,
            globalScope.GlobalStore?.renderedAisVessels,
        ];
        matchingCollections.forEach(collection => {
            if (!Array.isArray(collection)) return;
            collection.forEach(item => {
                if (mergeMatch(item, identity, technical) && !hydratedMatch) hydratedMatch = item;
            });
        });
        vesselCollections.forEach(collection => mergeCollection(collection, identity, technical, false));
        refreshMatchingDerivedState();
        globalScope.dispatchEvent(new CustomEvent('vessel:due-diligence-hydrated', {
            detail: { identity: { ...identity }, technical: { ...technical } },
        }));
        return hydratedMatch;
    }

    function proposalKey(identity) {
        return normalizeImo(identity?.imo)
            || normalizeMmsi(identity?.mmsi)
            || readText(identity?.name || identity?.vesselName).toLowerCase();
    }

    function findMatchingResult(identity) {
        const collections = [
            globalScope.matchingResultsState?.vessels,
            globalScope.lastMatchingEngineResults,
            globalScope.GlobalStore?.matchingVessels,
        ];
        for (const collection of collections) {
            if (!Array.isArray(collection)) continue;
            const match = collection.find(item => vesselIdentityMatches(item?.vessel, identity)
                || vesselIdentityMatches(item?.ais, identity)
                || vesselIdentityMatches(item, identity));
            if (match) return match;
        }
        return null;
    }

    function proposalValue(field, value) {
        if (field === 'dwt' && value) return `${Number(value).toLocaleString()} MT`;
        return readText(value) || 'Sin dato';
    }

    function buildProposals(identity, technical) {
        const match = findMatchingResult(identity);
        const current = normalizeTechnicalRecord(match?.vessel || match?.ais || match || {});
        const proposals = PROPOSAL_FIELDS.flatMap(({ field, label }) => {
            const proposedValue = technical[field];
            if (proposedValue === null || proposedValue === undefined || proposedValue === '') return [];
            const currentValue = current[field];
            if (readText(currentValue).toLowerCase() === readText(proposedValue).toLowerCase()) return [];
            return [{ field, label, currentValue, proposedValue }];
        });
        return { current, match, proposals };
    }

    function isNonCommercialVesselType(vesselType) {
        return NON_COMMERCIAL_VESSEL_PATTERN.test(readText(vesselType));
    }

    function clearProposalReview(card, key) {
        if (key) pendingProposals.delete(key);
        const review = card?.querySelector('[data-due-diligence-review]');
        if (review) {
            review.replaceChildren();
            review.classList.add('hidden');
        }
    }

    function buildPersistenceVessel(identity, technical, match) {
        const vessel = match?.vessel && typeof match.vessel === 'object' ? match.vessel : {};
        const ais = match?.ais && typeof match.ais === 'object' ? match.ais : {};
        return mergeNonEmptyRecords(mergeNonEmptyRecords(mergeNonEmptyRecords(ais, vessel), identity), {
            ...technical,
            imo: technical.imo,
            imo_number: technical.imo,
            vesselName: vessel.vesselName || vessel.vessel_name || identity.name,
            vessel_name: vessel.vessel_name || vessel.vesselName || identity.name,
            mmsi: vessel.mmsi || ais.mmsi || identity.mmsi,
            latitude: vessel.latitude ?? ais.latitude ?? identity.latitude ?? null,
            longitude: vessel.longitude ?? ais.longitude ?? identity.longitude ?? null,
            vesselType: technical.vesselType,
            vessel_type: technical.vesselType,
            yearBuilt: technical.yearBuilt,
            year_built: technical.yearBuilt,
        });
    }

    function notify(message, variant = 'success') {
        if (typeof globalScope.showToast === 'function') {
            globalScope.showToast(message, false, variant);
        } else if (variant === 'error') {
            console.error(message);
        }
    }

    function renderProposalReview(card, key, proposals, technical = {}) {
        const review = card?.querySelector('[data-due-diligence-review]');
        if (!review || !globalScope.document) return;
        review.replaceChildren();
        review.className = 'rounded-lg border border-cyan-200 bg-white p-2.5 space-y-2 shadow-sm';

        const title = globalScope.document.createElement('p');
        title.className = 'text-[10px] font-black uppercase tracking-wide text-cyan-900';
        title.textContent = 'Revisión de datos encontrados';
        review.append(title);

        const extractedType = readText(technical.vesselType) || 'Sin dato';
        const typeSummary = globalScope.document.createElement('div');
        typeSummary.className = 'flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px]';
        const typeLabel = globalScope.document.createElement('strong');
        typeLabel.textContent = 'Tipo de Buque';
        const typeValue = globalScope.document.createElement('span');
        typeValue.className = 'font-black text-slate-800';
        typeValue.textContent = extractedType;
        typeSummary.append(typeLabel, typeValue);
        review.append(typeSummary);

        const commerciallyBlocked = isNonCommercialVesselType(extractedType);
        if (commerciallyBlocked) {
            const warning = globalScope.document.createElement('div');
            warning.className = 'rounded border border-red-300 bg-red-50 px-2 py-2 text-[10px] font-black text-red-800';
            warning.textContent = `❌ BUQUE NO COMERCIAL DETECTADO: ${extractedType}`;
            review.append(warning);
        }

        proposals.forEach(proposal => {
            const row = globalScope.document.createElement('div');
            row.className = 'grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 text-[10px]';
            const label = globalScope.document.createElement('strong');
            label.textContent = proposal.label;
            const current = globalScope.document.createElement('span');
            current.className = 'truncate text-slate-500 line-through';
            current.textContent = proposalValue(proposal.field, proposal.currentValue);
            const arrow = globalScope.document.createElement('span');
            arrow.className = 'text-cyan-600';
            arrow.textContent = '→';
            const proposed = globalScope.document.createElement('span');
            proposed.className = 'truncate font-bold text-emerald-700';
            proposed.textContent = proposalValue(proposal.field, proposal.proposedValue);
            row.append(label, current, arrow, proposed);
            review.append(row);
        });

        const actions = globalScope.document.createElement('div');
        actions.className = 'grid grid-cols-2 gap-2 pt-1';
        const reject = globalScope.document.createElement('button');
        reject.type = 'button';
        reject.dataset.dueDiligenceReject = key;
        reject.className = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50';
        reject.textContent = 'Rechazar';
        const accept = globalScope.document.createElement('button');
        accept.type = 'button';
        accept.dataset.dueDiligenceAccept = key;
        accept.disabled = commerciallyBlocked;
        accept.setAttribute('aria-disabled', String(commerciallyBlocked));
        accept.className = commerciallyBlocked
            ? 'cursor-not-allowed rounded bg-red-200 px-2 py-1.5 text-[10px] font-black uppercase text-red-700 opacity-70'
            : 'rounded bg-emerald-600 px-2 py-1.5 text-[10px] font-black uppercase text-white hover:bg-emerald-500';
        accept.textContent = 'Aceptar Datos';
        actions.append(reject, accept);
        review.append(actions);
    }

    async function acceptPendingProposal(key, card = null, acceptButton = null) {
        const pending = pendingProposals.get(key);
        if (!pending) return false;
        if (pending.commerciallyBlocked || isNonCommercialVesselType(pending.technical?.vesselType)) {
            notify(`Buque no comercial bloqueado: ${pending.technical?.vesselType || 'tipo no apto'}.`, 'error');
            return false;
        }
        if (acceptButton) {
            acceptButton.disabled = true;
            acceptButton.setAttribute('aria-busy', 'true');
            acceptButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...';
        }
        try {
            const currentMatch = pending.match || findMatchingResult(pending.identity);
            const vessel = buildPersistenceVessel(pending.identity, pending.technical, currentMatch);
            const status = card?.querySelector('[data-due-diligence-status]');
            if (status) {
                status.textContent = 'Guardando el buque en Neon antes de actualizar el Store...';
                status.className = 'text-[10px] font-bold text-cyan-700';
            }
            await persistDueDiligenceVessel(vessel, {
                fetchImpl: typeof globalScope.fetch === 'function' ? globalScope.fetch.bind(globalScope) : undefined,
            });
            const hydratedMatch = hydrateStores(pending.identity, pending.technical);
            const resolvedMatch = hydratedMatch || currentMatch || findMatchingResult(pending.identity);
            updateCard(card, pending.identity, pending.technical, resolvedMatch);
            clearProposalReview(card, key);
            if (status) {
                status.textContent = 'Perfil técnico guardado en Neon y listo para Calculadora.';
                status.className = 'text-[10px] font-bold text-emerald-700';
            }
            notify('Due Diligence guardada correctamente en Neon.');
            return true;
        } catch (error) {
            const status = card?.querySelector('[data-due-diligence-status]');
            if (status) {
                status.textContent = 'No se pudo guardar en Neon. El Store no fue modificado.';
                status.className = 'text-[10px] font-bold text-rose-700';
            }
            if (acceptButton) {
                acceptButton.disabled = false;
                acceptButton.setAttribute('aria-disabled', 'false');
                acceptButton.removeAttribute('aria-busy');
                acceptButton.textContent = 'Aceptar Datos';
            }
            notify(error instanceof Error ? error.message : 'No se pudo guardar el buque en Neon.', 'error');
            return false;
        }
    }

    function rejectPendingProposal(key, card = null) {
        if (!pendingProposals.has(key)) return false;
        clearProposalReview(card, key);
        const status = card?.querySelector('[data-due-diligence-status]');
        if (status) {
            status.textContent = 'Propuestas descartadas. No se modificó el buque.';
            status.className = 'text-[10px] font-semibold text-slate-600';
        }
        return true;
    }

    function setText(card, field, value) {
        card.querySelectorAll(`[data-vessel-field="${field}"]`).forEach(element => {
            element.textContent = value;
        });
    }

    function renderTechnicalValidation(card, match, technical) {
        if (!card || !match) return;
        const eligibility = match.technicalEligibility || {};
        const requiredDwt = Number(eligibility.dwt?.required) || 0;
        const verifiedDwt = Number(technical.dwt) || Number(match?.vessel?.dwt) || 0;
        const capacityOk = match.compatibility?.capacityOk === true;
        const comparison = card.querySelector('[data-vessel-capacity-comparison]');
        if (comparison) comparison.textContent = `Capacidad (${verifiedDwt.toLocaleString()} MT vs ${requiredDwt.toLocaleString()} MT):`;
        const capacityStatus = card.querySelector('[data-vessel-capacity-status]');
        if (capacityStatus) {
            capacityStatus.textContent = capacityOk ? 'OK' : match.dwtAssessment?.status === 'INSUFFICIENT' ? 'Insuficiente' : 'Revisar';
            capacityStatus.className = `font-bold ${capacityOk ? 'text-emerald-600' : 'text-rose-600'}`;
        }
        const reasonsContainer = card.querySelector('[data-technical-reasons]');
        const reasons = Array.isArray(eligibility.criticalReasons) ? eligibility.criticalReasons : [];
        if (reasonsContainer) {
            if (reasons.length === 0) {
                reasonsContainer.remove();
            } else {
                reasonsContainer.replaceChildren(...reasons.map(reason => {
                    const row = document.createElement('div');
                    row.textContent = `● ${reason}`;
                    return row;
                }));
            }
        }
        const auditCheckbox = card.querySelector('.matching-audit-select');
        if (auditCheckbox) auditCheckbox.checked = match.audit?.operationallyEligible === true;
    }

    function updateCard(card, identity, technical, match) {
        if (!card) return;
        const complete = Boolean(technical.imo && technical.dwt);
        if (technical.imo) setText(card, 'imo', `IMO ${technical.imo}`);
        if (technical.dwt) setText(card, 'dwt', `${technical.dwt.toLocaleString()} MT`);
        if (technical.flag) setText(card, 'flag', technical.flag);
        if (technical.vesselType) setText(card, 'vesselType', technical.vesselType);
        if (technical.yearBuilt) setText(card, 'yearBuilt', String(technical.yearBuilt));
        if (technical.draft) setText(card, 'draft', `${technical.draft}m`);
        renderTechnicalValidation(card, match, technical);
        if (!complete) return;

        card.querySelectorAll('[data-missing-technical-warning="true"]').forEach(element => element.remove());
        card.querySelectorAll('[data-vessel-field="dwt"]').forEach(element => {
            element.classList.remove('text-red-700');
            element.classList.add('text-slate-700');
        });
        card.querySelectorAll('[data-vessel-field="imo"]').forEach(element => {
            element.classList.remove('bg-red-50', 'text-red-700', 'border-red-300');
            element.classList.add('bg-slate-100', 'text-slate-500', 'border-slate-200');
        });
        card.classList.remove('border-red-200', 'bg-red-50/40', 'opacity-80');
        card.classList.add('border-slate-200', 'bg-white', 'shadow-sm');
        const dueButton = card.querySelector('[data-due-diligence-button]');
        if (dueButton) dueButton.classList.add('hidden');
        const applyButton = card.querySelector('[data-calculator-apply-button]');
        if (applyButton) {
            applyButton.disabled = false;
            applyButton.setAttribute('aria-disabled', 'false');
            applyButton.classList.remove('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
            applyButton.classList.add('bg-slate-900', 'hover:bg-slate-800', 'text-white');
            const payload = JSON.parse(decodeURIComponent(applyButton.dataset.vesselJson || '%7B%7D'));
            mergeTechnicalFields(payload, technical);
            if (payload.vessel_name === undefined) payload.vessel_name = identity.name;
            applyButton.dataset.vesselJson = encodeURIComponent(JSON.stringify(payload));
        }
        const status = card.querySelector('[data-due-diligence-status]');
        if (status) {
            status.textContent = 'Perfil técnico verificado por Data Bridge. Listo para Calculadora.';
            status.className = 'text-[10px] font-bold text-emerald-700';
        }
    }

    async function runVesselDueDiligence(button, encodedIdentity) {
        const card = button?.closest('[data-matching-result-card="true"]');
        const status = card?.querySelector('[data-due-diligence-status]');
        const originalHtml = button?.innerHTML || '';
        let identity;
        try {
            identity = JSON.parse(decodeURIComponent(encodedIdentity));
        } catch {
            if (status) status.textContent = 'No se pudo leer la identidad del buque.';
            return false;
        }

        if (button) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.innerHTML = '<i class="fa-solid fa-satellite-dish fa-spin"></i> Consultando Data Bridge...';
        }
        if (status) {
            status.textContent = 'Buscando el buque por IMO, MMSI o nombre en fuentes públicas...';
            status.className = 'text-[10px] font-bold text-cyan-700';
        }
        globalScope.dueDiligenceExternalOnlyActive = true;
        globalScope.dueDiligenceSuppressLocalPersistenceUntil = Date.now() + 2000;

        try {
            const imo = normalizeImo(identity.imo);
            const mmsi = normalizeMmsi(identity.mmsi);
            const vesselName = readText(identity.name);
            if (!/^\d{7}$/.test(imo) && !mmsi && !vesselName) {
                throw new Error('Due Diligence requiere al menos IMO, MMSI o nombre del buque.');
            }
            const controller = new AbortController();
            const responsePayload = await fetchDueDiligence(
                { imo, mmsi, vesselName },
                { fetchImpl: globalScope.fetch.bind(globalScope), signal: controller.signal },
            );
            const dueDiligenceData = readExternalScrapeRecord(responsePayload);
            const technical = normalizeTechnicalRecord({
                ...dueDiligenceData,
                imo_number: dueDiligenceData.imo_number || dueDiligenceData.imo || imo,
            });
            const review = buildProposals(identity, technical);
            if (review.proposals.length === 0) {
                throw new Error('La búsqueda no devolvió datos técnicos nuevos para revisar.');
            }
            const key = proposalKey(identity);
            pendingProposals.set(key, {
                identity: { ...identity },
                technical: { ...technical },
                proposals: review.proposals.map(proposal => ({ ...proposal })),
                match: review.match,
                commerciallyBlocked: isNonCommercialVesselType(technical.vesselType),
            });
            renderProposalReview(card, key, review.proposals, technical);
            if (status) {
                status.textContent = `${review.proposals.length} cambios encontrados. Revísalos antes de actualizar el buque.`;
                status.className = 'text-[10px] font-bold text-cyan-700';
            }
            if (button) button.innerHTML = originalHtml;
            return true;
        } catch (error) {
            if (status) {
                status.textContent = error instanceof Error ? error.message : 'No se pudo completar la Due Diligence.';
                status.className = 'text-[10px] font-bold text-rose-700';
            }
            if (button) button.innerHTML = '<i class="fa-solid fa-rotate"></i> Reintentar Due Diligence';
            return false;
        } finally {
            globalScope.dueDiligenceExternalOnlyActive = false;
            globalScope.dueDiligenceSuppressLocalPersistenceUntil = Date.now() + 1500;
            if (button && !button.classList.contains('hidden')) {
                button.disabled = false;
                button.removeAttribute('aria-busy');
                if (!button.innerHTML.trim()) button.innerHTML = originalHtml;
            }
        }
    }

    function handleDueDiligenceClick(event) {
        const acceptButton = event?.target?.closest?.('[data-due-diligence-accept]');
        const rejectButton = event?.target?.closest?.('[data-due-diligence-reject]');
        if (acceptButton || rejectButton) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const actionButton = acceptButton || rejectButton;
            const card = actionButton.closest('[data-matching-result-card="true"]');
            const key = acceptButton?.dataset.dueDiligenceAccept || rejectButton?.dataset.dueDiligenceReject || '';
            if (acceptButton) void acceptPendingProposal(key, card, acceptButton);
            else rejectPendingProposal(key, card);
            return;
        }
        const button = event?.target?.closest?.('[data-due-diligence-button][data-external-scraper-only="true"]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void runVesselDueDiligence(button, button.dataset.dueDiligencePayload || '');
    }

    if (globalScope.document && globalScope.document.addEventListener) {
        globalScope.document.addEventListener('click', handleDueDiligenceClick, true);
    }

    globalScope.runVesselDueDiligence = runVesselDueDiligence;
    globalScope.VesselDueDiligenceBridge = Object.freeze({
        hydrateStores,
        acceptPendingProposal,
        buildProposals,
        buildPersistenceVessel,
        isNonCommercialVesselType,
        mergeTechnicalFields,
        mergeNonEmptyRecords,
        normalizeTechnicalRecord,
        pendingProposals,
        proposalKey,
        reevaluateTechnicalMatch,
        refreshMatchingDerivedState,
        rejectPendingProposal,
        readExternalScrapeRecord,
        run: runVesselDueDiligence,
    });
})(window);
