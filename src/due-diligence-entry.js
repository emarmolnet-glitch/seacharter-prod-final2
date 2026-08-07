import { discardDueDiligenceVessel, fetchDueDiligence, persistDueDiligenceVessel } from './services/dueDiligenceService.js';
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
        { field: 'grossTonnage', label: 'Gross Tonnage' },
        { field: 'loaMeters', label: 'LOA' },
        { field: 'beamMeters', label: 'Manga' },
    ]);
    const pendingProposals = new Map();
    const dueDiligenceDataByVessel = new Map();
    let activeDensityAuditRequest = 0;

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

    function normalizeFieldLabel(value) {
        return readText(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    function readLabeledValue(record, labels) {
        if (!record || typeof record !== 'object') return undefined;
        const entriesByLabel = new Map(Object.entries(record).map(([key, value]) => [normalizeFieldLabel(key), value]));
        const matchedLabel = labels.map(normalizeFieldLabel).find(label => entriesByLabel.has(label));
        return matchedLabel ? entriesByLabel.get(matchedLabel) : undefined;
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
            vesselName: readText(readLabeledValue(record, ['Vessel Name', 'Ship Name', 'VesselName', 'ShipName', 'Name']) || readLabeledValue(meta, ['Vessel Name', 'Ship Name', 'ShipName'])),
            imo: normalizeImo(readLabeledValue(record, ['IMO Number', 'IMO', 'Numero IMO']) || readLabeledValue(meta, ['IMO Number', 'IMO'])),
            mmsi: normalizeMmsi(readLabeledValue(record, ['MMSI']) || readLabeledValue(meta, ['MMSI'])),
            dwt: readPositiveNumber(readLabeledValue(record, ['DWT', 'Deadweight']) || readLabeledValue(meta, ['DWT', 'Deadweight'])),
            flag: readText(readLabeledValue(record, ['Flag', 'Bandera', 'Country']) || readLabeledValue(meta, ['Flag', 'Bandera', 'Country'])),
            vesselType: readText(readLabeledValue(record, ['Vessel Type', 'Ship Type', 'VesselType', 'ShipType', 'Type']) || readLabeledValue(meta, ['Vessel Type', 'Ship Type', 'VesselType', 'ShipType', 'Type'])),
            yearBuilt: readYear(readLabeledValue(record, ['Year Built', 'Built Year', 'YearBuilt', 'Anio', 'Ano Construccion']) || readLabeledValue(meta, ['Year Built', 'Built Year', 'YearBuilt'])),
            grossTonnage: readPositiveNumber(readLabeledValue(record, ['Gross Tonnage', 'GrossTonnage', 'GT']) || readLabeledValue(meta, ['Gross Tonnage', 'GrossTonnage', 'GT'])),
            loaMeters: readPositiveNumber(readLabeledValue(record, ['LOA Meters', 'LOA', 'Length', 'Length Overall']) || readLabeledValue(meta, ['LOA Meters', 'LOA', 'Length', 'Length Overall'])),
            beamMeters: readPositiveNumber(readLabeledValue(record, ['Beam Meters', 'Beam', 'Breadth', 'Manga']) || readLabeledValue(meta, ['Beam Meters', 'Beam', 'Breadth', 'Manga'])),
            draft: readPositiveNumber(readLabeledValue(record, ['Draft', 'Draught', 'Draft Meters', 'Calado']) || readLabeledValue(meta, ['Draft', 'Draught', 'Calado'])),
            callSign: readText(readLabeledValue(record, ['Call Sign', 'CallSign', 'Callsign']) || readLabeledValue(meta, ['Call Sign', 'CallSign'])),
            lastPort: readText(readLabeledValue(record, ['Last Port', 'LastPort', 'Last Port of Call', 'Previous Port']) || readLabeledValue(meta, ['Last Port', 'LastPort'])),
            eta: readText(readLabeledValue(record, ['ETA', 'Estimated Time of Arrival', 'Arrival Time']) || readLabeledValue(meta, ['ETA'])),
            destination: readText(readLabeledValue(record, ['Destination', 'Current Destination']) || readLabeledValue(meta, ['Destination'])),
            navigationStatus: readText(readLabeledValue(record, ['Navigation Status', 'Navigational Status', 'Nav Status']) || readLabeledValue(meta, ['Navigation Status', 'Nav Status'])),
            sourceUrl: readText(record?.sourceUrl || record?.source_url),
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
        return payload.rawData?.vessel
            || payload.rawData?.record
            || payload.rawData?.records?.[0]
            || payload.rawData
            || payload.vessel
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
            target.dwtStatus = 'VERIFIED_BY_EXTERNAL_AUDIT';
            meta.dwt = technical.dwt;
            meta.DWT = technical.dwt;
            meta.dwtStatus = 'VERIFIED_BY_EXTERNAL_AUDIT';
        }
        if (technical.flag) {
            target.flag = technical.flag;
            target.bandera = technical.flag;
            meta.flag = technical.flag;
        }
        if (technical.vesselType) {
            target.vesselClass = technical.vesselType;
            target.vessel_class = technical.vesselType;
            target.vesselType = technical.vesselType;
            target.vessel_type = technical.vesselType;
            target.shipType = technical.vesselType;
            target.ship_type = technical.vesselType;
            target.ShipType = technical.vesselType;
            target.type = technical.vesselType;
            target.tipo_buque = technical.vesselType;
            target.radarCategory = technical.vesselType;
            target.verifiedVesselClass = technical.vesselType;
            target.vesselClassVerified = true;
            target.vesselClassSource = 'VESSELS_MASTER';
            meta.vesselClass = technical.vesselType;
            meta.vessel_class = technical.vesselType;
            meta.vesselType = technical.vesselType;
            meta.vessel_type = technical.vesselType;
            meta.shipType = technical.vesselType;
            meta.ship_type = technical.vesselType;
            meta.ShipType = technical.vesselType;
        }
        if (technical.yearBuilt) {
            target.yearBuilt = technical.yearBuilt;
            target.builtYear = technical.yearBuilt;
            target.built_year = technical.yearBuilt;
            target.ano_construccion = technical.yearBuilt;
            meta.yearBuilt = technical.yearBuilt;
        }
        if (technical.grossTonnage) {
            target.grossTonnage = technical.grossTonnage;
            target.gross_tonnage = technical.grossTonnage;
            target.gt = technical.grossTonnage;
            meta.grossTonnage = technical.grossTonnage;
            meta.gross_tonnage = technical.grossTonnage;
        }
        if (technical.loaMeters) {
            target.loaMeters = technical.loaMeters;
            target.loa_meters = technical.loaMeters;
            target.loa = technical.loaMeters;
            meta.loaMeters = technical.loaMeters;
            meta.loa_meters = technical.loaMeters;
        }
        if (technical.beamMeters) {
            target.beamMeters = technical.beamMeters;
            target.beam_meters = technical.beamMeters;
            target.beam = technical.beamMeters;
            target.breadth = technical.beamMeters;
            meta.beamMeters = technical.beamMeters;
            meta.beam_meters = technical.beamMeters;
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
            match.dwtStatus = 'VERIFIED_BY_EXTERNAL_AUDIT';
            match.dwtAssessment = {
                ...(match.dwtAssessment || {}),
                status: 'SUFFICIENT',
                source: 'EXTERNAL_DUE_DILIGENCE',
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
                grossTonnage: technical.grossTonnage || null,
                gross_tonnage: technical.grossTonnage || null,
                gt: technical.grossTonnage || null,
                loaMeters: technical.loaMeters || null,
                loa_meters: technical.loaMeters || null,
                loa: technical.loaMeters || null,
                beamMeters: technical.beamMeters || null,
                beam_meters: technical.beamMeters || null,
                beam: technical.beamMeters || null,
                vesselType: technical.vesselType || '',
                vessel_type: technical.vesselType || '',
                auditStatus: 'PENDING',
                audit_status: 'PENDING',
                source: 'external_due_diligence_validated',
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

    function setDueDiligenceData(identity, responsePayload, technical) {
        const key = proposalKey(identity);
        if (!key) return null;
        const stateEntry = {
            identity: { ...(identity && typeof identity === 'object' ? identity : {}) },
            payload: responsePayload && typeof responsePayload === 'object' ? responsePayload : {},
            data: { ...(technical && typeof technical === 'object' ? technical : {}) },
            persisted: responsePayload?.persisted === true,
            receivedAt: new Date().toISOString(),
        };
        dueDiligenceDataByVessel.set(key, stateEntry);
        globalScope.dueDiligenceDataByVessel = {
            ...(globalScope.dueDiligenceDataByVessel && typeof globalScope.dueDiligenceDataByVessel === 'object'
                ? globalScope.dueDiligenceDataByVessel
                : {}),
            [key]: stateEntry,
        };
        globalScope.dispatchEvent(new CustomEvent('vessel:due-diligence-data', {
            detail: { key, ...stateEntry },
        }));
        return stateEntry;
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
        if (['grossTonnage', 'loaMeters', 'beamMeters'].includes(field) && value) {
            const unit = field === 'grossTonnage' ? ' GT' : ' m';
            return `${Number(value).toLocaleString()}${unit}`;
        }
        return readText(value) || 'Sin dato';
    }

    function buildProposals(identity, technical) {
        const safeIdentity = identity && typeof identity === 'object' ? identity : {};
        const safeTechnical = technical && typeof technical === 'object' ? technical : {};
        const match = findMatchingResult(safeIdentity);
        const current = normalizeTechnicalRecord(match?.vessel || match?.ais || match || {});
        const proposals = PROPOSAL_FIELDS.flatMap(({ field, label }) => {
            const proposedValue = safeTechnical[field];
            if (proposedValue === null || proposedValue === undefined || proposedValue === '') return [];
            const currentValue = current[field];
            const changed = readText(currentValue).toLowerCase() !== readText(proposedValue).toLowerCase();
            return [{ field, label, currentValue, proposedValue, changed }];
        });
        return { current, match, proposals, changedCount: proposals.filter(proposal => proposal.changed).length };
    }

    function isNonCommercialVesselType(vesselType) {
        return NON_COMMERCIAL_VESSEL_PATTERN.test(readText(vesselType));
    }

    function getProposalReviewTarget(card = null) {
        const densityPanel = globalScope.document?.getElementById('density-due-diligence-panel');
        const densityPanelContent = globalScope.document?.getElementById('density-due-diligence-panel-content');
        const isDensityCommercialMatch = card?.matches?.('[data-density-commercial-match="true"]') === true;
        if (isDensityCommercialMatch && densityPanel && densityPanelContent) {
            return { review: densityPanelContent, panel: densityPanel };
        }
        const sidePanel = globalScope.document?.getElementById('due-diligence-side-panel');
        const sidePanelContent = globalScope.document?.getElementById('due-diligence-side-panel-content');
        const isRankingRecommendation = card?.matches?.('[data-vessel-recommendation="true"]') === true;
        if (isRankingRecommendation && sidePanel && sidePanelContent) {
            return { review: sidePanelContent, panel: sidePanel };
        }
        return { review: card?.querySelector('[data-due-diligence-review]') || null, panel: null };
    }

    function revealProposalReview(card, { focus = false } = {}) {
        const target = getProposalReviewTarget(card);
        if (!target.review) return target;
        target.review.classList.remove('hidden');
        if (target.panel) {
            target.panel.classList.remove('hidden');
            target.panel.setAttribute('aria-hidden', 'false');
            if (focus) {
                globalScope.requestAnimationFrame?.(() => {
                    const rect = target.panel.getBoundingClientRect?.();
                    const viewportHeight = Number(globalScope.innerHeight) || 0;
                    const outsideViewport = rect && viewportHeight > 0 && (rect.bottom <= 0 || rect.top >= viewportHeight);
                    if (outsideViewport) target.panel.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                    target.panel.focus?.({ preventScroll: true });
                });
            }
        }
        return target;
    }

    function renderProposalLoading(card, identity = {}) {
        const { review } = revealProposalReview(card, { focus: true });
        if (!review || !globalScope.document) return false;
        const vesselName = readText(identity.name || identity.vesselName) || 'Buque seleccionado';
        const imo = normalizeImo(identity.imo);
        review.className = 'min-w-0 w-full break-words bg-white';
        review.setAttribute('role', 'status');
        review.setAttribute('aria-label', `Consultando Due Diligence de ${vesselName}`);
        review.innerHTML = `
            <div class="border-b border-cyan-100 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-4 py-4 pr-12 text-white">
                <p class="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Due Diligence · Auditoría en vivo</p>
                <h4 class="mt-1 break-words text-base font-black leading-tight">${vesselName.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])}</h4>
                <p class="mt-1 font-mono text-[10px] text-slate-300">${imo ? `IMO ${imo}` : 'IMO pendiente de validación'}</p>
            </div>
            <div class="space-y-3 p-4">
                <div class="flex items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-3 text-cyan-900">
                    <i class="fa-solid fa-satellite-dish fa-spin text-cyan-600" aria-hidden="true"></i>
                    <div>
                        <p class="text-[11px] font-black">Consultando fuentes externas</p>
                        <p class="mt-0.5 text-[10px] leading-relaxed text-cyan-800">El dossier se actualiza aquí al completar la verificación técnica.</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2" aria-hidden="true">
                    <span class="h-14 animate-pulse rounded-lg bg-slate-100"></span>
                    <span class="h-14 animate-pulse rounded-lg bg-slate-100"></span>
                    <span class="h-14 animate-pulse rounded-lg bg-slate-100"></span>
                    <span class="h-14 animate-pulse rounded-lg bg-slate-100"></span>
                </div>
            </div>`;
        return true;
    }

    function renderProposalError(card, identity = {}, error) {
        const { review } = revealProposalReview(card, { focus: true });
        if (!review || !globalScope.document) return false;
        const vesselName = readText(identity.name || identity.vesselName) || 'Buque seleccionado';
        const message = error instanceof Error ? error.message : 'No se pudo completar la Due Diligence.';
        review.className = 'min-w-0 w-full break-words bg-white';
        review.setAttribute('role', 'alert');
        review.replaceChildren();
        const content = globalScope.document.createElement('div');
        content.className = 'p-4 pr-12';
        const eyebrow = globalScope.document.createElement('p');
        eyebrow.className = 'text-[9px] font-black uppercase tracking-[0.18em] text-rose-600';
        eyebrow.textContent = 'Due Diligence · Consulta interrumpida';
        const title = globalScope.document.createElement('h4');
        title.className = 'mt-1 break-words text-base font-black text-slate-900';
        title.textContent = vesselName;
        const detail = globalScope.document.createElement('p');
        detail.className = 'mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-rose-800';
        detail.textContent = message;
        content.append(eyebrow, title, detail);
        review.append(content);
        return true;
    }

    function clearProposalReview(card, key) {
        if (key) pendingProposals.delete(key);
        const { review, panel } = getProposalReviewTarget(card);
        if (review) {
            review.replaceChildren();
            review.classList.add('hidden');
        }
        if (panel) {
            panel.classList.add('hidden');
            panel.setAttribute('aria-hidden', 'true');
        }
    }

    function buildPersistenceVessel(identity, technical, match) {
        const safeIdentity = identity && typeof identity === 'object' ? identity : {};
        const safeTechnical = technical && typeof technical === 'object' ? technical : {};
        const vessel = match?.vessel && typeof match.vessel === 'object' ? match.vessel : {};
        const ais = match?.ais && typeof match.ais === 'object' ? match.ais : {};
        return mergeNonEmptyRecords(mergeNonEmptyRecords(mergeNonEmptyRecords(ais, vessel), safeIdentity), {
            ...safeTechnical,
            imo: safeTechnical.imo || safeIdentity.imo,
            imo_number: safeTechnical.imo || safeIdentity.imo,
            vesselName: safeTechnical.vesselName || safeIdentity.name || safeIdentity.vesselName || vessel.vesselName || vessel.vessel_name,
            vessel_name: safeTechnical.vesselName || safeIdentity.name || safeIdentity.vesselName || vessel.vessel_name || vessel.vesselName,
            mmsi: safeTechnical.mmsi || safeIdentity.mmsi || vessel.mmsi || ais.mmsi,
            latitude: vessel.latitude ?? ais.latitude ?? safeIdentity.latitude ?? null,
            longitude: vessel.longitude ?? ais.longitude ?? safeIdentity.longitude ?? null,
            vesselType: safeTechnical.vesselType,
            vessel_type: safeTechnical.vesselType,
            yearBuilt: safeTechnical.yearBuilt,
            year_built: safeTechnical.yearBuilt,
            grossTonnage: safeTechnical.grossTonnage,
            gross_tonnage: safeTechnical.grossTonnage,
            loaMeters: safeTechnical.loaMeters,
            loa_meters: safeTechnical.loaMeters,
            beamMeters: safeTechnical.beamMeters,
            beam_meters: safeTechnical.beamMeters,
        });
    }

    function normalizePersistedVessel(persistenceResult, fallbackVessel, technical) {
        const persisted = persistenceResult?.vessel && typeof persistenceResult.vessel === 'object'
            ? persistenceResult.vessel
            : {};
        const validatedVesselType = persisted.vessel_type
            || persisted.vesselType
            || technical.vesselType
            || fallbackVessel?.vessel_type
            || fallbackVessel?.vesselType
            || '';
        const vessel = mergeNonEmptyRecords(fallbackVessel, {
            ...persisted,
            ...technical,
            imo: persisted.imo || persisted.imo_number || technical.imo || fallbackVessel?.imo,
            imo_number: persisted.imo_number || persisted.imo || technical.imo || fallbackVessel?.imo_number,
            mmsi: persisted.mmsi || technical.mmsi || fallbackVessel?.mmsi,
            vesselName: persisted.vessel_name || persisted.vesselName || technical.vesselName || fallbackVessel?.vesselName,
            vessel_name: persisted.vessel_name || persisted.vesselName || technical.vesselName || fallbackVessel?.vessel_name,
            vesselClass: validatedVesselType,
            vessel_class: validatedVesselType,
            vesselType: validatedVesselType,
            vessel_type: validatedVesselType,
            shipType: validatedVesselType,
            ship_type: validatedVesselType,
            ShipType: validatedVesselType,
            type: validatedVesselType,
            tipo_buque: validatedVesselType,
            radarCategory: validatedVesselType,
            verifiedVesselClass: validatedVesselType,
            vesselClassVerified: Boolean(validatedVesselType),
            vesselClassSource: validatedVesselType ? 'VESSELS_MASTER' : fallbackVessel?.vesselClassSource,
            yearBuilt: persisted.year_built || persisted.yearBuilt || technical.yearBuilt || fallbackVessel?.yearBuilt,
            year_built: persisted.year_built || persisted.yearBuilt || technical.yearBuilt || fallbackVessel?.year_built,
            grossTonnage: persisted.gross_tonnage || persisted.grossTonnage || technical.grossTonnage || fallbackVessel?.grossTonnage,
            gross_tonnage: persisted.gross_tonnage || persisted.grossTonnage || technical.grossTonnage || fallbackVessel?.gross_tonnage,
            loaMeters: persisted.loa_meters || persisted.loaMeters || technical.loaMeters || fallbackVessel?.loaMeters,
            loa_meters: persisted.loa_meters || persisted.loaMeters || technical.loaMeters || fallbackVessel?.loa_meters,
            beamMeters: persisted.beam_meters || persisted.beamMeters || technical.beamMeters || fallbackVessel?.beamMeters,
            beam_meters: persisted.beam_meters || persisted.beamMeters || technical.beamMeters || fallbackVessel?.beam_meters,
            dueDiligenceValidated: true,
            dueDiligenceValidatedAt: new Date().toISOString(),
        });
        return vessel;
    }

    function commitVerifiedVesselToGlobalState(vessel) {
        if (!vessel || typeof vessel !== 'object') return null;
        const identity = {
            imo: vessel.imo || vessel.imo_number,
            mmsi: vessel.mmsi,
            name: vessel.vesselName || vessel.vessel_name || vessel.name,
        };
        const store = globalScope.GlobalStore;
        if (store) {
            const existing = Array.isArray(store.dueDiligenceVessels) ? store.dueDiligenceVessels : [];
            store.dueDiligenceVessels = [
                ...existing.filter(candidate => !vesselIdentityMatches(candidate, identity)),
                vessel,
            ];
            store.activeVessel = vessel;
            store.calculatorVessel = vessel;
        }
        globalScope.activeVessel = vessel;
        globalScope.objetoCalculadoraPrincipal = Object.freeze({ ...vessel });
        globalScope.dispatchEvent(new CustomEvent('vessel:due-diligence-persisted', {
            detail: { vessel: { ...vessel }, identity },
        }));
        return vessel;
    }

    function mergeVerifiedVesselIntoDensityState(vessel) {
        if (!vessel || typeof vessel !== 'object') return false;
        const identity = {
            imo: vessel.imo || vessel.imo_number,
            mmsi: vessel.mmsi,
            name: vessel.vesselName || vessel.vessel_name || vessel.name,
        };
        const technical = normalizeTechnicalRecord(vessel);
        const mergeCollection = collection => {
            if (!Array.isArray(collection)) return collection;
            return collection.map(candidate => {
                if (!vesselIdentityMatches(candidate, identity)) return candidate;
                const merged = {
                    ...candidate,
                    MetaData: candidate?.MetaData && typeof candidate.MetaData === 'object'
                        ? { ...candidate.MetaData }
                        : {},
                };
                mergeTechnicalFields(merged, technical);
                return mergeNonEmptyRecords(merged, {
                    vesselName: vessel.vesselName || vessel.vessel_name,
                    vessel_name: vessel.vessel_name || vessel.vesselName,
                    mmsi: vessel.mmsi,
                    masterValidated: true,
                    masterValidatedAt: new Date().toISOString(),
                    technicalDataSource: 'VESSELS_MASTER',
                });
            });
        };
        const store = globalScope.GlobalStore;
        if (store) {
            ['rawVessels', 'filteredVessels', 'vessels', 'renderedAisVessels'].forEach(collection => {
                store[collection] = mergeCollection(store[collection]);
            });
        }
        globalScope.openShipsVesselsCache = mergeCollection(globalScope.openShipsVesselsCache);
        globalScope.syncDensityDisplayConsumers?.({ updateGlobe: false });
        globalScope.dispatchEvent(new CustomEvent('vessel:density-optimistic-update', {
            detail: { vessel: { ...vessel }, identity },
        }));
        return true;
    }

    function removeDiscardedVesselFromDensity(identity = {}) {
        const safeIdentity = identity && typeof identity === 'object' ? identity : { imo: identity };
        const normalizedImo = normalizeImo(safeIdentity.imo);
        const normalizedMmsi = normalizeMmsi(safeIdentity.mmsi);
        if (!normalizedImo && !normalizedMmsi) return false;
        const matchesDiscardedIdentity = vessel => {
            const vesselImo = normalizeImo(vessel?.imo || vessel?.IMO || vessel?.imo_number || vessel?.MetaData?.IMO);
            const vesselMmsi = normalizeMmsi(vessel?.mmsi || vessel?.MMSI || vessel?.MetaData?.MMSI);
            return Boolean(
                (normalizedImo && vesselImo === normalizedImo)
                || (normalizedMmsi && vesselMmsi === normalizedMmsi)
            );
        };
        const store = globalScope.GlobalStore;
        if (typeof store?.markVesselDiscarded === 'function') {
            store.markVesselDiscarded({ imo: normalizedImo, mmsi: normalizedMmsi }, { source: 'due-diligence-discard' });
        } else if (store) {
            if (normalizedImo) store.discardedVesselImos = Array.from(new Set([...(store.discardedVesselImos || []), normalizedImo]));
            if (normalizedMmsi) store.discardedVesselMmsis = Array.from(new Set([...(store.discardedVesselMmsis || []), normalizedMmsi]));
            ['rawVessels', 'filteredVessels', 'vessels', 'renderedAisVessels'].forEach(collection => {
                if (Array.isArray(store[collection])) store[collection] = store[collection].filter(vessel => !matchesDiscardedIdentity(vessel));
            });
        }
        if (Array.isArray(globalScope.openShipsVesselsCache)) {
            globalScope.openShipsVesselsCache = globalScope.openShipsVesselsCache.filter(vessel => !matchesDiscardedIdentity(vessel));
        }
        globalScope.syncDensityDisplayConsumers?.();
        globalScope.dispatchEvent(new CustomEvent('vessel:discarded', {
            detail: { imo: normalizedImo, mmsi: normalizedMmsi },
        }));
        return true;
    }

    function notify(message, variant = 'success') {
        if (typeof globalScope.showToast === 'function') {
            globalScope.showToast(message, false, variant);
        } else if (variant === 'error') {
            console.error(message);
        }
    }

    function renderProposalReview(card, key, proposals, technical = {}) {
        const { review, panel } = revealProposalReview(card);
        if (!review || !globalScope.document) return false;
        const safeTechnical = technical && typeof technical === 'object' ? technical : {};
        const safeProposals = Array.isArray(proposals) ? proposals.filter(proposal => proposal && typeof proposal === 'object') : [];
        const pending = pendingProposals.get(key);
        const commerciallyBlocked = pending?.commerciallyBlocked === true || isNonCommercialVesselType(safeTechnical.vesselType);
        const grossTonnageRequired = !readPositiveNumber(safeTechnical.grossTonnage);
        const dataFields = [
            { label: 'Nombre del buque', value: readText(safeTechnical.vesselName) || pending?.identity?.name || 'Sin dato', featured: true },
            { label: 'IMO', value: readText(safeTechnical.imo) || 'Sin dato', mono: true },
            { label: 'MMSI', value: readText(safeTechnical.mmsi) || pending?.identity?.mmsi || 'Sin dato', mono: true },
            { label: 'DWT', value: safeTechnical.dwt ? `${Number(safeTechnical.dwt).toLocaleString()} MT` : 'Sin dato', featured: true },
            { label: 'Gross Tonnage (GT)', value: safeTechnical.grossTonnage ? Number(safeTechnical.grossTonnage).toLocaleString() : 'REQUERIDO', featured: true, required: grossTonnageRequired },
            { label: 'LOA', value: safeTechnical.loaMeters ? `${Number(safeTechnical.loaMeters).toLocaleString()} m` : 'Sin dato' },
            { label: 'Beam / Manga', value: safeTechnical.beamMeters ? `${Number(safeTechnical.beamMeters).toLocaleString()} m` : 'Sin dato' },
            { label: 'Calado', value: safeTechnical.draft ? `${Number(safeTechnical.draft).toLocaleString()} m` : 'Sin dato' },
            { label: 'Bandera', value: readText(safeTechnical.flag) || 'Sin dato' },
            { label: 'Año de construcción', value: safeTechnical.yearBuilt ? String(safeTechnical.yearBuilt) : 'Sin dato' },
            { label: 'Tipo de buque', value: readText(safeTechnical.vesselType) || 'Sin dato', featured: true },
            { label: 'Call Sign', value: readText(safeTechnical.callSign) || 'Sin dato', mono: true },
            { label: 'Last Port', value: readText(safeTechnical.lastPort) || 'Sin dato' },
            { label: 'ETA', value: readText(safeTechnical.eta) || 'Sin dato', mono: true },
            { label: 'Destino', value: readText(safeTechnical.destination) || 'Sin dato' },
            { label: 'Estado de navegación', value: readText(safeTechnical.navigationStatus) || 'Sin dato' },
        ];

        review.replaceChildren();
        review.className = 'min-w-0 w-full break-words bg-white';
        review.setAttribute('role', 'region');
        review.setAttribute('aria-label', 'Panel de validación Due Diligence');
        review.dataset.dueDiligenceExpanded = 'true';
        if (panel) {
            panel.classList.remove('hidden');
            panel.setAttribute('aria-hidden', 'false');
            panel.scrollTop = 0;
        }

        const header = globalScope.document.createElement('div');
        header.className = 'flex items-start justify-between gap-3 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-emerald-50 px-4 py-3';
        const heading = globalScope.document.createElement('div');
        heading.className = 'min-w-0 flex-1';
        const title = globalScope.document.createElement('p');
        title.className = 'break-words text-[11px] font-black uppercase tracking-[0.12em] text-cyan-950';
        title.textContent = 'Due Diligence · Validación técnica';
        const subtitle = globalScope.document.createElement('p');
        subtitle.className = 'mt-1 break-words text-[10px] font-semibold text-slate-500';
        subtitle.textContent = `${safeProposals.length} campo${safeProposals.length === 1 ? '' : 's'} contrastado${safeProposals.length === 1 ? '' : 's'} con fuentes externas.`;
        heading.append(title, subtitle);
        const stateBadge = globalScope.document.createElement('span');
        stateBadge.className = 'max-w-[9rem] shrink-0 truncate rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-800';
        stateBadge.textContent = 'Pendiente de guardar';
        header.append(heading, stateBadge);

        const dictionary = globalScope.document.createElement('dl');
        dictionary.className = 'grid min-w-0 grid-cols-1 gap-2 p-3 sm:grid-cols-2';
        dictionary.dataset.dueDiligenceTechnicalGrid = 'true';
        dataFields.forEach(field => {
            const item = globalScope.document.createElement('div');
            item.className = field.required
                ? 'min-w-0 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5 shadow-sm'
                : field.featured
                ? 'min-w-0 rounded-lg border border-cyan-200 bg-cyan-50/60 px-3 py-2.5'
                : 'min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5';
            const label = globalScope.document.createElement('dt');
            label.className = 'text-[9px] font-black uppercase tracking-[0.1em] text-slate-500';
            label.textContent = field.label;
            const value = globalScope.document.createElement('dd');
            value.className = `${field.mono ? 'font-mono ' : ''}mt-1 break-words text-[12px] font-black leading-snug ${field.required ? 'text-amber-700' : field.value === 'Sin dato' ? 'text-slate-400' : 'text-slate-900'}`;
            value.textContent = field.value;
            item.append(label, value);
            dictionary.append(item);
        });

        if (commerciallyBlocked) {
            const warning = globalScope.document.createElement('p');
            warning.className = 'mx-3 mb-3 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black text-red-800 sm:col-span-2';
            warning.textContent = `BUQUE NO COMERCIAL DETECTADO: ${safeTechnical.vesselType || 'tipo no apto'}`;
            dictionary.append(warning);
        }
        if (grossTonnageRequired) {
            const warning = globalScope.document.createElement('p');
            warning.className = 'mx-3 mb-3 break-words rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-900 sm:col-span-2';
            warning.textContent = 'GT REQUERIDO: no fue posible recuperarlo de fuentes externas ni de vessels_master. Es obligatorio para calcular costes portuarios.';
            dictionary.append(warning);
        }

        const footer = globalScope.document.createElement('footer');
        const densityCommercialFlow = card?.matches?.('[data-density-commercial-match="true"]') === true;
        footer.className = densityCommercialFlow
            ? 'grid grid-cols-1 gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-3 sm:grid-cols-3'
            : 'grid grid-cols-1 gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)]';
        footer.dataset.dueDiligenceFooter = 'true';
        if (densityCommercialFlow) {
            const discard = globalScope.document.createElement('button');
            discard.type = 'button';
            discard.dataset.dueDiligenceDiscardVessel = key;
            discard.disabled = !normalizeImo(safeTechnical.imo || pending?.identity?.imo)
                && !normalizeMmsi(safeTechnical.mmsi || pending?.identity?.mmsi);
            discard.setAttribute('aria-disabled', String(discard.disabled));
            discard.className = discard.disabled
                ? 'cursor-not-allowed rounded-lg bg-red-100 px-3 py-2 text-[10px] font-black uppercase text-red-400 opacity-70'
                : 'rounded-lg bg-red-700 px-3 py-2 text-[10px] font-black uppercase text-white transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400';
            discard.textContent = 'Descartar Buque';

            const save = globalScope.document.createElement('button');
            save.type = 'button';
            save.dataset.dueDiligenceSave = key;
            save.disabled = commerciallyBlocked || grossTonnageRequired;
            save.setAttribute('aria-disabled', String(save.disabled));
            save.className = save.disabled
                ? 'cursor-not-allowed rounded-lg bg-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-400 opacity-70'
                : 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400';
            save.textContent = 'Guardar Datos';

            const calculate = globalScope.document.createElement('button');
            calculate.type = 'button';
            calculate.dataset.dueDiligenceCalculate = key;
            calculate.disabled = commerciallyBlocked || grossTonnageRequired;
            calculate.setAttribute('aria-disabled', String(calculate.disabled));
            calculate.className = calculate.disabled
                ? 'cursor-not-allowed rounded-lg bg-emerald-200 px-3 py-2 text-[10px] font-black uppercase text-emerald-700 opacity-70'
                : 'rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black uppercase text-white shadow-sm transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400';
            calculate.textContent = 'Calcular Flete';
            footer.append(discard, save, calculate);
        } else {
        const reject = globalScope.document.createElement('button');
        reject.type = 'button';
        reject.dataset.dueDiligenceReject = key;
        reject.className = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-600 transition hover:bg-slate-100';
        reject.textContent = 'Descartar';
        const accept = globalScope.document.createElement('button');
        accept.type = 'button';
        accept.dataset.dueDiligenceAccept = key;
        accept.disabled = commerciallyBlocked || grossTonnageRequired;
        accept.setAttribute('aria-disabled', String(commerciallyBlocked || grossTonnageRequired));
        accept.className = commerciallyBlocked || grossTonnageRequired
            ? 'cursor-not-allowed rounded-lg bg-red-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-red-700 opacity-70'
            : 'rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400';
        accept.textContent = grossTonnageRequired ? 'GT REQUERIDO PARA VALIDAR' : 'Validar y Guardar en Master (Neon DB)';
        footer.append(reject, accept);
        }

        review.append(header, dictionary, footer);
        return true;
    }

    function recalculateFinancialEngine(identity, technical) {
        const safeIdentity = identity && typeof identity === 'object' ? identity : {};
        const safeTechnical = technical && typeof technical === 'object' ? technical : {};
        const activeVessel = globalScope.GlobalStore?.calculatorVessel || globalScope.GlobalStore?.activeVessel;
        if (!activeVessel || !vesselIdentityMatches(activeVessel, safeIdentity)) return false;
        mergeTechnicalFields(activeVessel, safeTechnical);
        const fieldUpdates = [
            ['imo', safeTechnical.imo],
            ['dwt', safeTechnical.dwt],
            ['flag', safeTechnical.flag],
            ['gt', safeTechnical.grossTonnage],
            ['loa', safeTechnical.loaMeters],
            ['year_built', safeTechnical.yearBuilt],
        ];
        if (typeof globalScope.handleManualVesselUpdate === 'function') {
            fieldUpdates.forEach(([field, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    globalScope.handleManualVesselUpdate(field, value);
                }
            });
        }
        if (typeof globalScope.debouncedAutoFillPDA === 'function') {
            globalScope.debouncedAutoFillPDA('pol', false, 0);
            globalScope.debouncedAutoFillPDA('pod', false, 0);
        }
        if (typeof globalScope.scheduleReactiveEngine === 'function') {
            globalScope.scheduleReactiveEngine();
        } else if (typeof globalScope.runEngine === 'function') {
            globalScope.runEngine();
        }
        globalScope.dispatchEvent(new CustomEvent('vessel:financial-recalculated', {
            detail: { identity: { ...safeIdentity }, technical: { ...safeTechnical } },
        }));
        return true;
    }

    async function acceptPendingProposal(key, card = null, acceptButton = null, { calculateFreight = false } = {}) {
        const pending = pendingProposals.get(key);
        if (!pending) return false;
        const pendingIdentity = pending.identity && typeof pending.identity === 'object' ? pending.identity : {};
        const pendingTechnical = pending.technical && typeof pending.technical === 'object' ? pending.technical : {};
        if (!proposalKey(pendingIdentity)) {
            notify('No se pudo identificar el buque para guardar la Due Diligence.', 'error');
            return false;
        }
        if (pending.commerciallyBlocked || isNonCommercialVesselType(pendingTechnical.vesselType)) {
            notify(`Buque no comercial bloqueado: ${pendingTechnical.vesselType || 'tipo no apto'}.`, 'error');
            return false;
        }
        const densityCommercialFlow = card?.matches?.('[data-density-commercial-match="true"]') === true;
        if (densityCommercialFlow && !readPositiveNumber(pendingTechnical.grossTonnage)) {
            notify('GT REQUERIDO: completa el Gross Tonnage antes de validar el buque.', 'error');
            return false;
        }
        if (acceptButton) {
            acceptButton.disabled = true;
            acceptButton.setAttribute('aria-busy', 'true');
            acceptButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...';
        }
        try {
            const currentMatch = pending.match || findMatchingResult(pendingIdentity);
            const vessel = buildPersistenceVessel(pendingIdentity, pendingTechnical, currentMatch);
            const status = card?.querySelector('[data-due-diligence-status]');
            if (status) {
                status.textContent = calculateFreight
                    ? 'Guardando el buque en Neon antes de abrir la Calculadora...'
                    : 'Guardando los datos técnicos en Neon...';
                status.className = 'text-[10px] font-bold text-cyan-700';
            }
            const persistenceResult = await persistDueDiligenceVessel(vessel, {
                fetchImpl: typeof globalScope.fetch === 'function' ? globalScope.fetch.bind(globalScope) : undefined,
            });
            let verifiedVessel = normalizePersistedVessel(persistenceResult, vessel, pendingTechnical);
            const classRegistry = globalScope.VesselMasterClassRegistry;
            classRegistry?.recordVerifiedVesselClass?.(verifiedVessel);
            verifiedVessel = classRegistry?.applyVerifiedVesselClass?.(verifiedVessel) || verifiedVessel;
            if (densityCommercialFlow) {
                try {
                    mergeVerifiedVesselIntoDensityState(verifiedVessel);
                } catch (densitySyncError) {
                    console.warn('[Due Diligence] Optimistic Density sync failed.', densitySyncError);
                }
            }
            if (!densityCommercialFlow || calculateFreight) commitVerifiedVesselToGlobalState(verifiedVessel);
            if (!densityCommercialFlow || calculateFreight) {
                const hydratedMatch = hydrateStores(pendingIdentity, pendingTechnical);
                const resolvedMatch = hydratedMatch || currentMatch || findMatchingResult(pendingIdentity);
                updateCard(card, pendingIdentity, pendingTechnical, resolvedMatch);
            }
            const financialRecalculated = densityCommercialFlow ? false : recalculateFinancialEngine(pendingIdentity, pendingTechnical);
            clearProposalReview(card, key);
            if (densityCommercialFlow && calculateFreight) {
                if (typeof globalScope.applyResolvedVesselToCalculator === 'function') {
                    globalScope.applyResolvedVesselToCalculator(
                        verifiedVessel,
                        verifiedVessel.vessel_name || verifiedVessel.vesselName || pendingIdentity.name || '',
                    );
                }
                if (typeof globalScope.switchTab === 'function') globalScope.switchTab('estimator');
            }
            if (status) {
                status.textContent = densityCommercialFlow && calculateFreight
                    ? 'Buque guardado. Abriendo la Calculadora...'
                    : densityCommercialFlow
                    ? 'Datos técnicos guardados en Neon.'
                    : financialRecalculated
                    ? 'Perfil guardado en Neon. PDAs y márgenes recalculados.'
                    : 'Perfil técnico guardado en Neon y disponible para el estimador.';
                status.className = 'text-[10px] font-bold text-emerald-700';
            }
            notify(densityCommercialFlow && calculateFreight
                ? 'Buque guardado. Abriendo la Calculadora...'
                : densityCommercialFlow
                ? 'Datos técnicos guardados correctamente.'
                : 'Due Diligence guardada correctamente en Neon.');
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
                acceptButton.textContent = calculateFreight ? 'Calcular Flete' : 'Guardar Datos';
            }
            notify(error instanceof Error ? error.message : 'No se pudo guardar el buque en Neon.', 'error');
            return false;
        }
    }

    async function discardPendingVessel(key, card = null, discardButton = null) {
        const pending = pendingProposals.get(key);
        if (!pending) return false;
        const pendingIdentity = pending.identity && typeof pending.identity === 'object' ? pending.identity : {};
        const pendingTechnical = pending.technical && typeof pending.technical === 'object' ? pending.technical : {};
        const imo = normalizeImo(pendingTechnical.imo || pendingIdentity.imo);
        const mmsi = normalizeMmsi(pendingTechnical.mmsi || pendingIdentity.mmsi);
        if (!imo && !mmsi) {
            notify('Se requiere un IMO o MMSI válido para descartar el buque.', 'error');
            return false;
        }
        if (discardButton) {
            discardButton.disabled = true;
            discardButton.setAttribute('aria-busy', 'true');
            discardButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Descartando...';
        }
        try {
            const currentMatch = pending.match || findMatchingResult(pendingIdentity);
            const vessel = buildPersistenceVessel(pendingIdentity, {
                ...pendingTechnical,
                imo,
                mmsi,
                status: 'discarded',
            }, currentMatch);
            await discardDueDiligenceVessel(vessel, {
                fetchImpl: typeof globalScope.fetch === 'function' ? globalScope.fetch.bind(globalScope) : undefined,
            });
            removeDiscardedVesselFromDensity({ imo, mmsi });
            clearProposalReview(card, key);
            notify('Buque descartado y excluido del radar OpenShips.');
            return true;
        } catch (error) {
            if (discardButton) {
                discardButton.disabled = false;
                discardButton.removeAttribute('aria-busy');
                discardButton.textContent = 'Descartar Buque';
            }
            notify(error instanceof Error ? error.message : 'No se pudo descartar el buque.', 'error');
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

        const applyButton = card.querySelector('[data-calculator-apply-button]');
        if (applyButton) {
            const payload = JSON.parse(decodeURIComponent(applyButton.dataset.vesselJson || '%7B%7D'));
            mergeTechnicalFields(payload, technical);
            if (payload.vessel_name === undefined) payload.vessel_name = identity.name;
            applyButton.dataset.vesselJson = encodeURIComponent(JSON.stringify(payload));
        }
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
        if (applyButton) {
            applyButton.disabled = false;
            applyButton.setAttribute('aria-disabled', 'false');
            applyButton.classList.remove('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
            applyButton.classList.add('bg-slate-900', 'hover:bg-slate-800', 'text-white');
        }
        const status = card.querySelector('[data-due-diligence-status]');
        if (status) {
            status.textContent = 'Perfil técnico auditado con fuentes externas. Puedes volver a contrastarlo cuando sea necesario.';
            status.className = 'text-[10px] font-bold text-emerald-700';
        }
    }

    async function runVesselDueDiligence(button, encodedIdentity) {
        const card = button?.closest('[data-matching-result-card="true"], [data-matching-cache-card="true"], [data-vessel-recommendation="true"], [data-density-commercial-match="true"]');
        const densityCommercialFlow = card?.matches?.('[data-density-commercial-match="true"]') === true;
        const densityAuditRequest = densityCommercialFlow ? ++activeDensityAuditRequest : 0;
        const status = card?.querySelector('[data-due-diligence-status]');
        const originalHtml = button?.innerHTML || '';
        let identity;
        try {
            identity = JSON.parse(decodeURIComponent(encodedIdentity));
        } catch {
            if (status) status.textContent = 'No se pudo leer la identidad del buque.';
            return false;
        }

        if (densityCommercialFlow) renderProposalLoading(card, identity);

        if (button) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.innerHTML = '<i class="fa-solid fa-satellite-dish fa-spin"></i> Consultando fuentes externas...';
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
            const hasAuditableData = Boolean(technical.imo || technical.dwt || technical.grossTonnage || technical.flag || technical.yearBuilt || technical.vesselType || technical.callSign || technical.lastPort || technical.eta);
            if (!hasAuditableData) {
                throw new Error('La búsqueda externa no devolvió campos técnicos auditables.');
            }
            const key = proposalKey({ ...identity, imo: technical.imo || identity.imo });
            setDueDiligenceData({ ...identity, imo: technical.imo || identity.imo }, responsePayload, technical);
            pendingProposals.set(key, {
                identity: { ...identity },
                technical: { ...technical },
                proposals: review.proposals.map(proposal => ({ ...proposal })),
                match: review.match,
                card,
                commerciallyBlocked: isNonCommercialVesselType(technical.vesselType),
            });
            if (!densityCommercialFlow || densityAuditRequest === activeDensityAuditRequest) {
                renderProposalReview(card, key, review.proposals, technical);
            }
            if (status) {
                status.textContent = review.changedCount > 0
                    ? `${review.changedCount} cambios encontrados. Revísalos antes de actualizar Neon.`
                    : 'Los valores externos coinciden. Puedes confirmar la auditoría en Neon.';
                status.className = 'text-[10px] font-bold text-cyan-700';
            }
            if (button) button.innerHTML = originalHtml;
            return true;
        } catch (error) {
            if (densityCommercialFlow && densityAuditRequest === activeDensityAuditRequest) {
                renderProposalError(card, identity, error);
            }
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
        const discardVesselButton = event?.target?.closest?.('[data-due-diligence-discard-vessel]');
        const saveButton = event?.target?.closest?.('[data-due-diligence-save]');
        const calculateButton = event?.target?.closest?.('[data-due-diligence-calculate]');
        if (discardVesselButton || saveButton || calculateButton) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const actionButton = discardVesselButton || saveButton || calculateButton;
            const key = discardVesselButton?.dataset.dueDiligenceDiscardVessel
                || saveButton?.dataset.dueDiligenceSave
                || calculateButton?.dataset.dueDiligenceCalculate
                || '';
            const card = actionButton.closest('[data-density-commercial-match="true"]') || pendingProposals.get(key)?.card || null;
            if (discardVesselButton) void discardPendingVessel(key, card, discardVesselButton);
            else void acceptPendingProposal(key, card, actionButton, { calculateFreight: Boolean(calculateButton) });
            return;
        }
        const acceptButton = event?.target?.closest?.('[data-due-diligence-accept]');
        const rejectButton = event?.target?.closest?.('[data-due-diligence-reject]');
        if (acceptButton || rejectButton) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const actionButton = acceptButton || rejectButton;
            const key = acceptButton?.dataset.dueDiligenceAccept || rejectButton?.dataset.dueDiligenceReject || '';
            const card = actionButton.closest('[data-matching-result-card="true"], [data-matching-cache-card="true"], [data-vessel-recommendation="true"], [data-density-commercial-match="true"]')
                || pendingProposals.get(key)?.card
                || null;
            if (acceptButton) void acceptPendingProposal(key, card, acceptButton);
            else rejectPendingProposal(key, card);
            return;
        }
        const button = event?.target?.closest?.('[data-due-diligence-button][data-due-diligence-mode]');
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
        mergeVerifiedVesselIntoDensityState,
        mergeNonEmptyRecords,
        normalizeTechnicalRecord,
        dueDiligenceDataByVessel,
        discardPendingVessel,
        pendingProposals,
        proposalKey,
        recalculateFinancialEngine,
        reevaluateTechnicalMatch,
        refreshMatchingDerivedState,
        rejectPendingProposal,
        readExternalScrapeRecord,
        run: runVesselDueDiligence,
        setDueDiligenceData,
    });
})(window);
