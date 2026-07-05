(function (root) {
    'use strict';

    function toNumber(value, fallback = 0) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function roundMoney(value) {
        return Math.round(toNumber(value) * 100) / 100;
    }

    function clampMin(value, min = 0) {
        return Math.max(min, toNumber(value));
    }

    function normalizePercent(value) {
        const numeric = toNumber(value);
        return numeric > 1 ? numeric / 100 : numeric;
    }

    function pickBaseResult(baseResult = {}) {
        const fuelBreakdown = baseResult.fuelBreakdown || {};
        const ownerBreakdown = baseResult.ownerNetBreakdown || {};
        const dailyOpex = clampMin(baseResult.opex || baseResult.smartAdjustments?.opexDaily);
        const dailyCapex = clampMin(baseResult.capexDaily || ownerBreakdown.capexDaily || baseResult.smartAdjustments?.capexDaily);
        const daysSea = clampMin(baseResult.daysSea);
        const daysPort = clampMin(baseResult.daysPort);
        const totalDays = clampMin(baseResult.totalDays || (daysSea + daysPort));
        const totalBunkers = clampMin(baseResult.totalBunkers || fuelBreakdown.totalCost);
        const netProfitOwner = toNumber(baseResult.netProfitOwner);

        return {
            ...baseResult,
            daysSea,
            daysPort,
            totalDays,
            totalBunkers,
            dailyOpex,
            dailyCapex,
            dailyOperatingCapitalCost: dailyOpex + dailyCapex,
            netProfitOwner,
            fuelBreakdown
        };
    }

    function calculateStressedFuelCost(base, stressInputs) {
        const volatilityFactor = 1 + clampMin(normalizePercent(stressInputs.bunkerVolatility));
        const portDelayFactor = Math.max(1, toNumber(stressInputs.portDelayFactor, 1));
        const fuelBreakdown = base.fuelBreakdown || {};
        const navigationCost = clampMin(fuelBreakdown.navigation?.cost);
        const portCost = clampMin(fuelBreakdown.port?.cost);
        const anchorageCost = clampMin(fuelBreakdown.anchorage?.cost) + clampMin(fuelBreakdown.anchorageAuxiliary?.cost);
        const knownFuelCost = navigationCost + portCost + anchorageCost;
        const fallbackFuelCost = base.totalBunkers;
        const totalFuelCost = knownFuelCost > 0 ? knownFuelCost : fallbackFuelCost;
        const knownNonPortCost = navigationCost + anchorageCost;
        const effectivePortCost = portCost > 0 ? portCost : Math.max(0, totalFuelCost - knownNonPortCost);
        const stressedPortFuelCost = effectivePortCost * portDelayFactor;
        const stressedFuelCost = (knownNonPortCost + stressedPortFuelCost) * volatilityFactor;

        return {
            baseFuelCost: roundMoney(totalFuelCost),
            stressedFuelCost: roundMoney(stressedFuelCost),
            fuelDelta: roundMoney(stressedFuelCost - totalFuelCost),
            volatilityFactor,
            portDelayFactor
        };
    }

    function classifyRisk(baseNetProfit, stressedNetProfit) {
        if (stressedNetProfit <= 0) {
            return { level: 'Rojo', label: 'Rojo', color: 'red', description: 'Beneficio neto no positivo tras aplicar estrés.' };
        }
        const erosion = baseNetProfit > 0 ? (baseNetProfit - stressedNetProfit) / baseNetProfit : 0;
        if (erosion >= 0.25) {
            return { level: 'Amarillo', label: 'Amarillo', color: 'yellow', description: 'Beneficio positivo, pero con erosión relevante.' };
        }
        return { level: 'Verde', label: 'Verde', color: 'green', description: 'Beneficio neto positivo con erosión controlada.' };
    }

    function runStressTest(baseResult, stressInputs = {}) {
        const base = pickBaseResult(baseResult);
        const offHireDays = clampMin(stressInputs.offHireDays);
        const portDelayFactor = Math.max(1, toNumber(stressInputs.portDelayFactor, 1));
        const stressedPortDays = base.daysPort * portDelayFactor;
        const addedPortDelayDays = Math.max(0, stressedPortDays - base.daysPort);
        const stressedTotalDays = base.daysSea + stressedPortDays + offHireDays;
        const fuel = calculateStressedFuelCost(base, { ...stressInputs, portDelayFactor });
        const portDelayOperatingCost = addedPortDelayDays * base.dailyOperatingCapitalCost;
        const lostProfit = offHireDays * base.dailyOperatingCapitalCost;
        const totalStressImpact = fuel.fuelDelta + portDelayOperatingCost + lostProfit;
        const stressedNetProfitOwner = base.netProfitOwner - totalStressImpact;
        const stressedResult = {
            ...base,
            totalDays: roundMoney(stressedTotalDays),
            daysPort: roundMoney(stressedPortDays),
            totalBunkers: fuel.stressedFuelCost,
            netProfitOwner: roundMoney(stressedNetProfitOwner),
            stressImpact: {
                bunkerDelta: fuel.fuelDelta,
                portDelayOperatingCost: roundMoney(portDelayOperatingCost),
                lostProfit: roundMoney(lostProfit),
                total: roundMoney(totalStressImpact),
                addedPortDelayDays: roundMoney(addedPortDelayDays),
                offHireDays: roundMoney(offHireDays)
            }
        };
        const delta = {
            netProfitOwner: roundMoney(stressedResult.netProfitOwner - base.netProfitOwner),
            totalBunkers: roundMoney(stressedResult.totalBunkers - base.totalBunkers),
            totalDays: roundMoney(stressedResult.totalDays - base.totalDays),
            lostProfit: stressedResult.stressImpact.lostProfit,
            totalStressImpact: stressedResult.stressImpact.total
        };

        return {
            baseResult: base,
            stressedResult,
            delta,
            riskStatus: classifyRisk(base.netProfitOwner, stressedResult.netProfitOwner)
        };
    }

    root.SeaCharterStressTestEngine = { runStressTest };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { runStressTest };
    }
}(typeof window !== 'undefined' ? window : globalThis));
