function finiteNumber(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateDynamicEta({ remainingDistanceNm, speedKnots, calculatedAt = new Date() } = {}) {
    const distanceNm = finiteNumber(remainingDistanceNm);
    const currentSpeedKnots = finiteNumber(speedKnots);
    const baseDate = validDate(calculatedAt) || new Date();
    if (distanceNm === null || distanceNm < 0 || currentSpeedKnots === null || currentSpeedKnots <= 0) {
        return {
            remainingDistanceNm: distanceNm,
            speedKnots: currentSpeedKnots,
            sailingHours: null,
            dynamicEtaAt: null,
        };
    }

    const sailingHours = distanceNm / currentSpeedKnots;
    return {
        remainingDistanceNm: distanceNm,
        speedKnots: currentSpeedKnots,
        sailingHours,
        dynamicEtaAt: new Date(baseDate.getTime() + sailingHours * 3_600_000).toISOString(),
    };
}

function statementProjection(statement) {
    const calculation = statement?.calculation && typeof statement.calculation === 'object' ? statement.calculation : {};
    const quantityMt = Math.max(0, finiteNumber(statement?.quantityMt, 0));
    const rateMtDay = finiteNumber(statement?.rateMtDay);
    const storedAllowedHours = finiteNumber(statement?.allowedHours);
    const calculatedAllowedHours = finiteNumber(calculation.allowedSeconds, 0) / 3_600;
    const allowedHours = Math.max(0, storedAllowedHours ?? calculatedAllowedHours);
    const actualUsedHours = Math.max(0, finiteNumber(calculation.usedSeconds, 0) / 3_600);
    const agreedOperationHours = rateMtDay && rateMtDay > 0
        ? (quantityMt / rateMtDay) * 24
        : allowedHours;
    const projectedUsedHours = statement?.operationCompletedAt
        ? actualUsedHours
        : Math.max(actualUsedHours, agreedOperationHours);
    const projectedExtraHours = Math.max(0, projectedUsedHours - allowedHours);
    const demurrageRateUsdDay = Math.max(0, finiteNumber(statement?.demurrageRateUsdDay, 0));

    return {
        operation: statement?.operation || '',
        allowedHours,
        actualUsedHours,
        agreedOperationHours,
        projectedUsedHours,
        projectedExtraHours,
        demurrageRateUsdDay,
        projectedDemurrageUsd: (projectedExtraHours / 24) * demurrageRateUsdDay,
    };
}

export function calculateLaytimeProjection(statements, dynamicEtaAt) {
    const normalizedStatements = Array.isArray(statements) ? statements.filter(Boolean) : [];
    if (!normalizedStatements.length) return null;

    const operations = normalizedStatements.map(statementProjection);
    const projection = operations.reduce((totals, operation) => ({
        allowedHours: totals.allowedHours + operation.allowedHours,
        usedHours: totals.usedHours + operation.actualUsedHours,
        projectedUsedHours: totals.projectedUsedHours + operation.projectedUsedHours,
        projectedExtraHours: totals.projectedExtraHours + operation.projectedExtraHours,
        projectedDemurrageUSD: totals.projectedDemurrageUSD + operation.projectedDemurrageUsd,
        demurrageRateUSD: Math.max(totals.demurrageRateUSD, operation.demurrageRateUsdDay),
    }), {
        allowedHours: 0,
        usedHours: 0,
        projectedUsedHours: 0,
        projectedExtraHours: 0,
        projectedDemurrageUSD: 0,
        demurrageRateUSD: 0,
    });
    const arrival = validDate(dynamicEtaAt);
    const projectedCompletionAt = arrival
        ? new Date(arrival.getTime() + projection.projectedUsedHours * 3_600_000).toISOString()
        : null;

    return {
        ...projection,
        laytimeRule: String(normalizedStatements[0]?.laytimeRule || 'SHINC').toUpperCase(),
        projectedDemurrageUSD: Number(projection.projectedDemurrageUSD.toFixed(2)),
        projectedCompletionAt,
        statementCount: operations.length,
        operations,
    };
}
