export const FEARNLEYS_CATEGORY_ROUTES = Object.freeze({
  'Handysize / Small Tanker': 'Handysize (38 000 dwt)',
  'Supramax / MR': 'Supramax (58 000 dwt)',
  Ultramax: 'Ultramax (64 000 dwt)',
  'Panamax / Kamsarmax / LR1': 'Panamax (75 000 dwt)',
  'Baby Cape / Aframax / LR2': 'Kamsarmax (82 000 dwt)',
  'Capesize / Suezmax': 'Capesize (180 000 dwt)',
  'VLOC / VLCC': 'Newcastlemax (208 000 dwt)',
});

export function getIsoWeek(date = new Date()) {
  const utcDate = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return {
    year: isoYear,
    weekNumber,
    weekId: `week-${weekNumber}-${isoYear}`,
  };
}

export function getFearnleysCacheKey(vesselCategory) {
  const route = FEARNLEYS_CATEGORY_ROUTES[vesselCategory];
  if (!route) return null;

  return `weekly/${vesselCategory
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.json`;
}

export function isCurrentWeekCacheEntry(entry, currentWeek) {
  return Boolean(
    entry
    && entry.weekId === currentWeek.weekId
    && Number.isFinite(Number(entry.value)),
  );
}

export async function fetchLatestFearnleysRate(vesselCategory, fetchImpl = fetch, now = new Date()) {
  const route = FEARNLEYS_CATEGORY_ROUTES[vesselCategory];
  if (!route) {
    throw new Error('Unsupported vessel category');
  }

  const dateTo = now.toISOString().slice(0, 10);
  const dateFromValue = new Date(now);
  dateFromValue.setUTCDate(dateFromValue.getUTCDate() - 28);
  const dateFrom = dateFromValue.toISOString().slice(0, 10);
  const query = `
    query LatestFearnleysRate($route: [String!]!, $dateFrom: date!, $dateTo: date!) {
      rate_meta(
        where: {
          info: {
            rate_type: { _eq: "BULK" }
            rate_subtype: { _eq: "TC" }
            route: { _in: $route }
          }
          rate_unit: { _eq: "usd" }
        }
      ) {
        rates(
          where: { date: { _gte: $dateFrom, _lte: $dateTo } }
          order_by: { date: desc }
          limit: 1
        ) {
          date
          rate
        }
      }
    }
  `;
  const response = await fetchImpl('https://pbrokerapp.hasura.app/v1/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'SeaCharterCorePro/1.0 Fearnleys weekly TCE cache',
    },
    body: JSON.stringify({
      query,
      variables: { route: [route], dateFrom, dateTo },
    }),
  });

  if (!response.ok) {
    throw new Error(`Fearnleys upstream returned ${response.status}`);
  }

  const payload = await response.json();
  const latestRate = payload?.data?.rate_meta?.[0]?.rates?.[0];
  const value = Number(latestRate?.rate);
  if (!Number.isFinite(value) || value <= 0 || !latestRate?.date) {
    throw new Error('Fearnleys returned no valid weekly rate');
  }

  return {
    value: Number(value.toFixed(2)),
    sourceDate: latestRate.date,
    sourceRoute: route,
  };
}
