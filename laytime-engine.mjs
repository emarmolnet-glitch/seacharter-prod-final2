const SECOND = 1_000;
const DAY_SECONDS = 86_400;

function finiteNumber(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function clampFactor(value) {
    return Math.min(1, Math.max(0, finiteNumber(value, 0)));
}

function iso(value) {
    return value instanceof Date ? value.toISOString() : null;
}

function normalizeIncident(incident, index) {
    const start = validDate(incident?.startAt);
    const end = validDate(incident?.endAt);
    if (!start || !end || end <= start) return null;
    return {
        id: String(incident?.id || `incident-${index + 1}`),
        category: String(incident?.category || 'OPERATIONAL').toUpperCase(),
        reason: String(incident?.reason || 'Incidencia operativa'),
        start,
        end,
        countingFactor: clampFactor(incident?.countingFactor),
    };
}

function validTimeZone(timeZone) {
    if (!timeZone) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
        return true;
    } catch {
        return false;
    }
}

function zonedParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function timeZoneOffsetMs(date, timeZone) {
    const parts = zonedParts(date, timeZone);
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return representedAsUtc - Math.floor(date.getTime() / SECOND) * SECOND;
}

function zonedMidnightUtc(year, month, day, timeZone) {
    const targetAsUtc = Date.UTC(year, month - 1, day);
    let candidate = new Date(targetAsUtc);
    for (let index = 0; index < 3; index += 1) {
        candidate = new Date(targetAsUtc - timeZoneOffsetMs(candidate, timeZone));
    }
    return candidate;
}

function isSunday(date, timeZone) {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date) === 'Sun';
}

function effectiveIncidentFactor(incident, terms) {
    if (incident.category === 'WEATHER' && !terms.weatherPermitting) return 1;
    return incident.countingFactor;
}

function segmentFactor(midpoint, incidents, terms) {
    let factor = terms.laytimeRule === 'SHEX' && isSunday(midpoint, terms.portTimeZone) ? 0 : 1;
    for (const incident of incidents) {
        if (midpoint >= incident.start && midpoint < incident.end) {
            factor = Math.min(factor, effectiveIncidentFactor(incident, terms));
        }
    }
    return factor;
}

function buildBoundaries(start, end, incidents, terms) {
    const boundaries = new Set([start.getTime(), end.getTime()]);
    for (const incident of incidents) {
        boundaries.add(Math.max(start.getTime(), incident.start.getTime()));
        boundaries.add(Math.min(end.getTime(), incident.end.getTime()));
    }
    if (terms.laytimeRule === 'SHEX') {
        const calendarStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - 2));
        const calendarEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 2));
        for (let cursor = calendarStart; cursor <= calendarEnd; cursor = new Date(cursor.getTime() + DAY_SECONDS * SECOND)) {
            const midnight = zonedMidnightUtc(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate(), terms.portTimeZone);
            if (midnight > start && midnight < end) boundaries.add(midnight.getTime());
        }
    }
    return [...boundaries]
        .filter((value) => value >= start.getTime() && value <= end.getTime())
        .sort((left, right) => left - right);
}

function durationLabel(seconds) {
    const sign = seconds < 0 ? '-' : '';
    const absolute = Math.abs(Math.round(seconds));
    const days = Math.floor(absolute / DAY_SECONDS);
    const hours = Math.floor((absolute % DAY_SECONDS) / 3_600);
    const minutes = Math.floor((absolute % 3_600) / 60);
    const secs = absolute % 60;
    return `${sign}${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export function calculateLaytime(input = {}) {
    const terms = {
        quantityMt: finiteNumber(input.quantityMt, 0),
        rateMtDay: finiteNumber(input.rateMtDay, 0),
        allowedHours: finiteNumber(input.allowedHours),
        demurrageRateUsdDay: Math.max(0, finiteNumber(input.demurrageRateUsdDay, 0)),
        laytimeRule: String(input.laytimeRule || 'SHINC').toUpperCase() === 'SHEX' ? 'SHEX' : 'SHINC',
        weatherPermitting: input.weatherPermitting !== false,
        onceOnDemurrage: input.onceOnDemurrage !== false,
        commencementDelayMinutes: Math.max(0, finiteNumber(input.commencementDelayMinutes, 0)),
        portTimeZone: validTimeZone(input.portTimeZone) ? input.portTimeZone : 'UTC',
    };
    const missingCritical = [];
    if (!validDate(input.norAcceptedAt) && !validDate(input.laytimeCommencedAt)) missingCritical.push('NOR_ACCEPTED_AT');
    if (!validDate(input.operationCompletedAt) && !validDate(input.asOfAt)) missingCritical.push('STATEMENT_AS_OF_AT');
    if (terms.allowedHours === null && !(terms.quantityMt > 0 && terms.rateMtDay > 0)) missingCritical.push('ALLOWED_LAYTIME_BASIS');
    if (!(terms.demurrageRateUsdDay > 0)) missingCritical.push('DEMURRAGE_RATE_USD_DAY');
    if (terms.laytimeRule === 'SHEX' && !validTimeZone(input.portTimeZone)) missingCritical.push('PORT_TIME_ZONE_FOR_SHEX');

    const acceptedAt = validDate(input.norAcceptedAt);
    const explicitCommencement = validDate(input.laytimeCommencedAt);
    const start = explicitCommencement || (acceptedAt
        ? new Date(acceptedAt.getTime() + terms.commencementDelayMinutes * 60 * SECOND)
        : null);
    const end = validDate(input.operationCompletedAt) || validDate(input.asOfAt);
    const allowedSeconds = terms.allowedHours !== null
        ? Math.max(0, terms.allowedHours * 3_600)
        : (terms.quantityMt > 0 && terms.rateMtDay > 0 ? (terms.quantityMt / terms.rateMtDay) * DAY_SECONDS : 0);

    if (!start || !end || end <= start || !allowedSeconds) {
        if (start && end && end <= start) missingCritical.push('INVALID_OPERATION_CHRONOLOGY');
        return {
            status: 'INCOMPLETE',
            calculationStatus: 'MISSING_CRITICAL_DATA',
            missingCritical: [...new Set(missingCritical)],
            terms,
            allowedSeconds,
            allowedLabel: durationLabel(allowedSeconds),
            usedSeconds: 0,
            usedLabel: durationLabel(0),
            balanceSeconds: allowedSeconds,
            balanceLabel: durationLabel(allowedSeconds),
            demurrageSeconds: 0,
            demurrageUsd: 0,
            excludedSeconds: 0,
            ignoredExceptionSeconds: 0,
            commencedAt: iso(start),
            completedOrAsOfAt: iso(end),
            generatedAt: new Date().toISOString(),
            segments: [],
        };
    }

    const incidents = (Array.isArray(input.incidents) ? input.incidents : [])
        .map(normalizeIncident)
        .filter(Boolean)
        .map((incident) => ({
            ...incident,
            start: new Date(Math.max(start.getTime(), incident.start.getTime())),
            end: new Date(Math.min(end.getTime(), incident.end.getTime())),
        }))
        .filter((incident) => incident.end > incident.start);
    const boundaries = buildBoundaries(start, end, incidents, terms);
    const segments = [];
    let usedSeconds = 0;
    let excludedSeconds = 0;
    let ignoredExceptionSeconds = 0;
    let demurrageStartedAt = null;

    for (let index = 0; index < boundaries.length - 1; index += 1) {
        const segmentStart = new Date(boundaries[index]);
        const segmentEnd = new Date(boundaries[index + 1]);
        const elapsedSeconds = (segmentEnd.getTime() - segmentStart.getTime()) / SECOND;
        if (elapsedSeconds <= 0) continue;
        const midpoint = new Date((segmentStart.getTime() + segmentEnd.getTime()) / 2);
        const contractualFactor = segmentFactor(midpoint, incidents, terms);
        let countedSeconds = elapsedSeconds * contractualFactor;
        let ignoredSeconds = 0;

        if (terms.onceOnDemurrage && usedSeconds >= allowedSeconds) {
            countedSeconds = elapsedSeconds;
            ignoredSeconds = elapsedSeconds * (1 - contractualFactor);
        } else if (terms.onceOnDemurrage && contractualFactor > 0 && usedSeconds + countedSeconds > allowedSeconds) {
            const secondsToDemurrage = (allowedSeconds - usedSeconds) / contractualFactor;
            const preDemurrageElapsed = Math.max(0, Math.min(elapsedSeconds, secondsToDemurrage));
            const postDemurrageElapsed = elapsedSeconds - preDemurrageElapsed;
            countedSeconds = (preDemurrageElapsed * contractualFactor) + postDemurrageElapsed;
            ignoredSeconds = postDemurrageElapsed * (1 - contractualFactor);
            demurrageStartedAt = new Date(segmentStart.getTime() + preDemurrageElapsed * SECOND);
        }

        if (!demurrageStartedAt && usedSeconds < allowedSeconds && usedSeconds + countedSeconds >= allowedSeconds) {
            const effectiveRate = countedSeconds / elapsedSeconds;
            const secondsToDemurrage = effectiveRate > 0 ? (allowedSeconds - usedSeconds) / effectiveRate : elapsedSeconds;
            demurrageStartedAt = new Date(segmentStart.getTime() + Math.max(0, Math.min(elapsedSeconds, secondsToDemurrage)) * SECOND);
        }
        usedSeconds += countedSeconds;
        excludedSeconds += Math.max(0, elapsedSeconds - countedSeconds - ignoredSeconds);
        ignoredExceptionSeconds += ignoredSeconds;
        segments.push({
            startAt: iso(segmentStart),
            endAt: iso(segmentEnd),
            elapsedSeconds,
            contractualFactor,
            countedSeconds,
            excludedSeconds: Math.max(0, elapsedSeconds - countedSeconds - ignoredSeconds),
            ignoredExceptionSeconds: ignoredSeconds,
        });
    }

    const balanceSeconds = allowedSeconds - usedSeconds;
    const demurrageSeconds = Math.max(0, -balanceSeconds);
    const demurrageUsd = (demurrageSeconds / DAY_SECONDS) * terms.demurrageRateUsdDay;
    const status = demurrageSeconds > 0 ? 'ON_DEMURRAGE' : input.operationCompletedAt ? 'COMPLETED_WITHIN_LAYTIME' : 'LAYTIME_RUNNING';

    return {
        status,
        calculationStatus: missingCritical.length ? 'CALCULATED_WITH_WARNINGS' : 'CALCULATED',
        missingCritical: [...new Set(missingCritical)],
        terms,
        allowedSeconds,
        allowedLabel: durationLabel(allowedSeconds),
        elapsedSeconds: (end.getTime() - start.getTime()) / SECOND,
        usedSeconds,
        usedLabel: durationLabel(usedSeconds),
        balanceSeconds,
        balanceLabel: durationLabel(balanceSeconds),
        demurrageSeconds,
        demurrageLabel: durationLabel(demurrageSeconds),
        demurrageUsd: Number(demurrageUsd.toFixed(2)),
        excludedSeconds,
        excludedLabel: durationLabel(excludedSeconds),
        ignoredExceptionSeconds,
        commencedAt: iso(start),
        completedOrAsOfAt: iso(end),
        demurrageStartedAt: iso(demurrageStartedAt),
        generatedAt: new Date().toISOString(),
        segments,
    };
}

export { DAY_SECONDS, durationLabel };
