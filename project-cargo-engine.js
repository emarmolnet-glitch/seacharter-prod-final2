(function (root) {
    'use strict';

    const COST_RATES = Object.freeze({
        baseSecuring: 900,
        weightSecuringPerMt: 8,
        footprintSecuringPerM2: 45,
        spreaderRental: 2200,
        heavyShackles: 800,
        wireSlings: 1200,
        welders: 1600,
        longCargoDunnage: 1500,
        longCargoMultiplier: 1.65,
        mafiPerDay: 1800,
        spmtPerDay: 6500
    });

    function toNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    function isProjectCargoType(cargoType) {
        return /(project cargo|carga de proyecto|heavy lift|breakbulk|break bulk)/.test(normalizeText(cargoType));
    }

    function roundMoney(value) {
        return Math.round(toNumber(value) * 100) / 100;
    }

    function calculateProjectCargoRequirements(options = {}) {
        const unitWeightMT = toNumber(options.unitWeightMT);
        const length = toNumber(options.length);
        const width = toNumber(options.width);
        const height = toNumber(options.height);
        const cargoType = String(options.cargoType || '').trim();
        const handlingMode = normalizeText(options.handlingMode);
        const operationDays = Math.max(1, Math.ceil(toNumber(options.operationDays) || 1));
        const projectCargo = isProjectCargoType(cargoType);

        if (!projectCargo) {
            return {
                requiredEquipment: [],
                estimatedLashingCost: 0,
                craneRequirements: '',
                isProjectCargo: false,
                specialRequirementsDetected: false,
                appliedRules: [],
                costBreakdown: [],
                portCostAllocation: { pol: 0, pod: 0 },
                insightMessage: ''
            };
        }

        const requiredEquipment = [];
        const appliedRules = [];
        const costBreakdown = [];
        const footprint = length * width;
        const baseSecuringCost = Math.max(
            COST_RATES.baseSecuring,
            (unitWeightMT * COST_RATES.weightSecuringPerMt) + (footprint * COST_RATES.footprintSecuringPerM2)
        );
        costBreakdown.push({ item: 'Lashing & Securing base', amount: roundMoney(baseSecuringCost) });
        requiredEquipment.push('Lashing & Securing certificado', 'Timber / Dunnage de apoyo');

        let estimatedCost = baseSecuringCost;
        let craneRequirements = 'Geared vessel sujeto a validación del plan de izado y SWL.';

        if (unitWeightMT > 40) {
            appliedRules.push('HEAVY_LIFT');
            requiredEquipment.push('Spreaders / lifting beams', 'Heavy Shackles', 'Wire Slings', 'Welders para clips de trincaje');
            [
                ['Alquiler de spreaders', COST_RATES.spreaderRental],
                ['Grilletes de alta capacidad', COST_RATES.heavyShackles],
                ['Eslingas de cable de acero', COST_RATES.wireSlings],
                ['Soldadores para clips de trincaje', COST_RATES.welders]
            ].forEach(([item, amount]) => {
                costBreakdown.push({ item, amount });
                estimatedCost += amount;
            });
            craneRequirements = `Geared Vessel / Heavy Lift Cranes obligatorias; SWL mínimo ${Math.ceil(unitWeightMT)}T por unidad, con izado combinable sujeto al lifting plan.`;
        }

        if (length > 15) {
            appliedRules.push('OUT_OF_GAUGE_LENGTH');
            requiredEquipment.push('Webbing Slings', 'Balancines para carga larga', 'Dunnage reforzado para reparto de cargas');
            const longCargoMaterialCost = (baseSecuringCost * (COST_RATES.longCargoMultiplier - 1)) + COST_RATES.longCargoDunnage;
            costBreakdown.push({ item: 'Multiplicador OOG y dunnage reforzado', amount: roundMoney(longCargoMaterialCost) });
            estimatedCost += longCargoMaterialCost;
        }

        const cargoKey = normalizeText(cargoType);
        const needsRoRoTransport = /(roro|ro-ro|rolling|rodante|static roro|estatica roro)/.test(`${cargoKey} ${handlingMode}`)
            || /(maquinaria|transformador)/.test(cargoKey) && /(roro|rampa|sin izado|port transport)/.test(handlingMode);
        if (needsRoRoTransport) {
            appliedRules.push('RORO_HEAVY_TRANSPORT');
            const useSpmt = unitWeightMT > 80 || /spmt|transformador/.test(`${cargoKey} ${handlingMode}`);
            const equipment = useSpmt ? 'SPMT' : 'MAFI / Roll Trailer';
            const dailyRate = useSpmt ? COST_RATES.spmtPerDay : COST_RATES.mafiPerDay;
            const transportCost = dailyRate * operationDays;
            requiredEquipment.push(equipment);
            costBreakdown.push({ item: `Alquiler ${equipment} (${operationDays} día${operationDays === 1 ? '' : 's'})`, amount: roundMoney(transportCost) });
            estimatedCost += transportCost;
        }

        const estimatedLashingCost = roundMoney(estimatedCost);
        const polAllocation = roundMoney(estimatedLashingCost / 2);
        const podAllocation = roundMoney(estimatedLashingCost - polAllocation);
        const descriptors = [];
        if (appliedRules.includes('HEAVY_LIFT')) descriptors.push(`Heavy Lift (${unitWeightMT.toLocaleString('en-US')} MT/unidad)`);
        if (appliedRules.includes('OUT_OF_GAUGE_LENGTH')) descriptors.push(`OOG longitudinal (${length.toLocaleString('en-US')} m)`);
        if (appliedRules.includes('RORO_HEAVY_TRANSPORT')) descriptors.push('traslado pesado RoRo');
        const insightMessage = `${descriptors.length ? `${descriptors.join(' y ')} detectado. ` : 'Carga de proyecto detectada. '}El sistema ha presupuestado ${estimatedLashingCost.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} extra en la PDA para medios de izado, estiba, trincaje y maquinaria auxiliar. ${craneRequirements}`;

        return {
            requiredEquipment: [...new Set(requiredEquipment)],
            estimatedLashingCost,
            craneRequirements,
            isProjectCargo: true,
            specialRequirementsDetected: true,
            appliedRules,
            costBreakdown,
            portCostAllocation: { pol: polAllocation, pod: podAllocation },
            insightMessage,
            cargoEnvelope: { unitWeightMT, length, width, height, footprint }
        };
    }

    const api = {
        COST_RATES,
        isProjectCargoType,
        calculateProjectCargoRequirements
    };

    root.ProjectCargoEngine = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
