const COMTRADE_PROXY_ENDPOINT = '/.netlify/functions/comtrade';
const CACHE_PREFIX = 'seacharter:comtrade:v3';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_CONSOLIDATED_PERIOD = 2025;
const RATE_LIMIT_MESSAGE = 'Límite de peticiones de la ONU alcanzado. Espere unos minutos';

const ISO3_TO_M49: Record<string, number> = {
  DZA: 12,
  PRT: 620,
  ESP: 724,
  LBY: 434,
  TUR: 792,
  EGY: 818,
  ITA: 380,
  FRA: 250,
  GRC: 300,
  MAR: 504,
  TUN: 788,
  W00: 0,
  WLD: 0,
  WORLD: 0,
};

type CachedValue<T> = {
  expiresAt: number;
  value: T;
};

type ReporterReference = {
  reporterCode: number;
  reporterCodeIsoAlpha2?: string;
  reporterCodeIsoAlpha3?: string;
};

type ReporterReferenceResponse = {
  results?: ReporterReference[];
};

type ComtradeRecord = {
  flowCode?: string;
  refYear?: number;
  period?: string;
  reporterCode?: number;
  partnerCode?: number;
  cmdCode?: string;
  netWgt?: number;
  cifvalue?: number;
  fobvalue?: number;
  primaryValue?: number;
};

type ComtradeResponse = {
  data?: ComtradeRecord[];
  error?: string;
  message?: string;
  statusCode?: number;
};

export type TradeMarginResult = {
  reporterIso: string;
  partnerIso: string;
  cmdCode: string;
  period: string;
  netWeightMt: number;
  cifPricePerMt: number;
  fobPricePerMt: number;
  logisticsMarginPerMt: number;
  source: 'UN Comtrade';
};

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readCache<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const rawValue = storage.getItem(`${CACHE_PREFIX}:${key}`);
    if (!rawValue) return null;
    const cached = JSON.parse(rawValue) as CachedValue<T>;
    if (!Number.isFinite(cached.expiresAt) || cached.expiresAt <= Date.now()) {
      storage.removeItem(`${CACHE_PREFIX}:${key}`);
      return null;
    }
    return cached.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const cached: CachedValue<T> = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    };
    storage.setItem(`${CACHE_PREFIX}:${key}`, JSON.stringify(cached));
  } catch {
    // Storage can be unavailable or full; the live response remains usable.
  }
}

function normalizeIso(value: string): string {
  return String(value || '').trim().toUpperCase();
}

function normalizeCmdCode(value: string): string {
  const cmdCode = String(value || '').trim();
  if (!/^\d{4,6}$/.test(cmdCode)) {
    throw new Error('El código SA debe contener entre 4 y 6 dígitos.');
  }
  return cmdCode;
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error('[UN Comtrade] La petición al proxy no pudo completarse.', {
      endpoint: COMTRADE_PROXY_ENDPOINT,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('No se pudo conectar con el servicio de UN Comtrade.');
  }

  const payload = await response.json().catch(() => ({})) as T & {
    error?: string;
    message?: string;
    statusCode?: number;
  };
  const apiStatusCode = Number(payload.statusCode || 0);
  if (response.status === 429 || apiStatusCode === 429) {
    throw new Error(RATE_LIMIT_MESSAGE);
  }
  if (!response.ok || apiStatusCode >= 400) {
    const message = payload.message || payload.error || `UN Comtrade respondió con estado ${apiStatusCode || response.status}.`;
    console.error('[UN Comtrade] Error del proxy o del servicio remoto.', {
      endpoint: COMTRADE_PROXY_ENDPOINT,
      httpStatus: response.status,
      apiStatusCode: apiStatusCode || undefined,
      message,
    });
    throw new Error(message);
  }
  return payload;
}

async function getReporterReferences(): Promise<ReporterReference[]> {
  const cached = readCache<ReporterReference[]>('reporters');
  if (cached) return cached;

  const query = new URLSearchParams({ reference: 'reporters' });
  const response = await fetchJson<ReporterReferenceResponse>(`${COMTRADE_PROXY_ENDPOINT}?${query}`);
  const reporters = Array.isArray(response.results) ? response.results : [];
  writeCache('reporters', reporters);
  return reporters;
}

async function resolveCountryCode(iso: string): Promise<number> {
  const normalizedIso = normalizeIso(iso);
  if (normalizedIso in ISO3_TO_M49) return ISO3_TO_M49[normalizedIso];
  if (normalizedIso === '0') return 0;
  if (/^\d{1,3}$/.test(normalizedIso)) return Number(normalizedIso);
  if (!/^[A-Z]{2,3}$/.test(normalizedIso)) {
    throw new Error(`Código de país no válido: ${normalizedIso || 'vacío'}.`);
  }

  const reporters = await getReporterReferences();
  const match = reporters.find((reporter) => (
    reporter.reporterCodeIsoAlpha2?.toUpperCase() === normalizedIso
    || reporter.reporterCodeIsoAlpha3?.toUpperCase() === normalizedIso
  ));
  if (!match) throw new Error(`UN Comtrade no reconoce el país ${normalizedIso}.`);
  return Number(match.reporterCode);
}

async function getTradeRecords(
  reporterCode: number,
  partnerCode: number,
  cmdCode: string,
  flowCode: 'M' | 'X' = 'M',
): Promise<ComtradeRecord[]> {
  const responseCacheKey = `response:${flowCode}:${reporterCode}:${partnerCode}:${cmdCode}:${LAST_CONSOLIDATED_PERIOD}`;
  let response = readCache<ComtradeResponse>(responseCacheKey);

  if (!response) {
    const query = new URLSearchParams({
      flowcode: flowCode,
      reportercode: String(reporterCode),
      partnercode: String(partnerCode),
      cmdcode: cmdCode,
      period: String(LAST_CONSOLIDATED_PERIOD),
    });
    response = await fetchJson<ComtradeResponse>(`${COMTRADE_PROXY_ENDPOINT}?${query}`);
    writeCache(responseCacheKey, response);
  }

  if (response.error) throw new Error(response.error);
  if (response.statusCode && response.statusCode >= 400) {
    throw new Error(response.message || `UN Comtrade respondió con estado ${response.statusCode}.`);
  }
  return Array.isArray(response.data) ? response.data : [];
}

function getTradeValue(record: ComtradeRecord, fields: Array<'cifvalue' | 'fobvalue' | 'primaryValue'>): number | null {
  for (const field of fields) {
    const value = Number(record[field]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function calculateUnitValue(
  records: ComtradeRecord[],
  fields: Array<'cifvalue' | 'fobvalue' | 'primaryValue'>,
): { pricePerMt: number; netWeightMt: number; period: string } | null {
  const usableRecords = records
    .map((record) => ({
      record,
      netWeightKg: Number(record.netWgt),
      tradeValue: getTradeValue(record, fields),
    }))
    .filter(({ netWeightKg, tradeValue }) => netWeightKg > 0 && tradeValue !== null);
  if (!usableRecords.length) return null;

  const latestYear = Math.max(...usableRecords.map(({ record }) => Number(record.refYear) || 0));
  const latestRecords = usableRecords.filter(({ record }) => Number(record.refYear) === latestYear);
  const totals = latestRecords.reduce((sum, item) => ({
    netWeightKg: sum.netWeightKg + item.netWeightKg,
    tradeValue: sum.tradeValue + Number(item.tradeValue),
  }), { netWeightKg: 0, tradeValue: 0 });
  const netWeightMt = totals.netWeightKg / 1000;

  return {
    pricePerMt: totals.tradeValue / netWeightMt,
    netWeightMt,
    period: String(latestYear || latestRecords[0]?.record.period || ''),
  };
}

function hasExplicitCifFob(records: ComtradeRecord[]): boolean {
  return records.some((record) => (
    Number(record.netWgt) > 0
    && Number.isFinite(Number(record.cifvalue))
    && Number.isFinite(Number(record.fobvalue))
  ));
}

function calculateMargin(
  records: ComtradeRecord[],
  reporterIso: string,
  partnerIso: string,
  cmdCode: string,
): TradeMarginResult {
  const usableRecords = records.filter((record) => (
    Number(record.netWgt) > 0
    && Number.isFinite(Number(record.cifvalue))
    && Number.isFinite(Number(record.fobvalue))
  ));
  if (!usableRecords.length) {
    throw new Error('No hay registros CIF/FOB comparables para la selección actual.');
  }

  const latestYear = Math.max(...usableRecords.map((record) => Number(record.refYear) || 0));
  const latestRecords = usableRecords.filter((record) => Number(record.refYear) === latestYear);
  const totals = latestRecords.reduce((sum, record) => ({
    netWeightKg: sum.netWeightKg + Number(record.netWgt || 0),
    cifValue: sum.cifValue + Number(record.cifvalue || 0),
    fobValue: sum.fobValue + Number(record.fobvalue || 0),
  }), { netWeightKg: 0, cifValue: 0, fobValue: 0 });

  const netWeightMt = totals.netWeightKg / 1000;
  const cifPricePerMt = totals.cifValue / netWeightMt;
  const fobPricePerMt = totals.fobValue / netWeightMt;

  return {
    reporterIso,
    partnerIso,
    cmdCode,
    period: String(latestYear || latestRecords[0]?.period || ''),
    netWeightMt,
    cifPricePerMt,
    fobPricePerMt,
    logisticsMarginPerMt: cifPricePerMt - fobPricePerMt,
    source: 'UN Comtrade',
  };
}

function calculateImportExportMargin(
  importerRecords: ComtradeRecord[],
  exporterRecords: ComtradeRecord[],
  reporterIso: string,
  partnerIso: string,
  cmdCode: string,
): TradeMarginResult {
  const importerCif = calculateUnitValue(importerRecords, ['cifvalue', 'primaryValue']);
  const exporterFob = calculateUnitValue(exporterRecords, ['fobvalue', 'primaryValue']);

  if (importerCif && exporterFob) {
    return {
      reporterIso,
      partnerIso,
      cmdCode,
      period: importerCif.period === exporterFob.period
        ? importerCif.period
        : `${importerCif.period}/${exporterFob.period}`,
      netWeightMt: importerCif.netWeightMt,
      cifPricePerMt: importerCif.pricePerMt,
      fobPricePerMt: exporterFob.pricePerMt,
      logisticsMarginPerMt: importerCif.pricePerMt - exporterFob.pricePerMt,
      source: 'UN Comtrade',
    };
  }

  if (hasExplicitCifFob(importerRecords)) {
    return calculateMargin(importerRecords, reporterIso, partnerIso, cmdCode);
  }

  throw new Error('No hay datos de importación y exportación comparables para la selección actual.');
}

export async function getTradeMargin(
  reporterIso: string,
  partnerIso: string,
  cmdCode: string,
): Promise<TradeMarginResult> {
  const normalizedReporter = normalizeIso(reporterIso);
  const normalizedPartner = normalizeIso(partnerIso);
  const normalizedCmdCode = normalizeCmdCode(cmdCode);
  const cacheKey = `margin:${normalizedReporter}:${normalizedPartner}:${normalizedCmdCode}`;
  const cached = readCache<TradeMarginResult>(cacheKey);
  if (cached) return cached;

  const [reporterCode, partnerCode] = await Promise.all([
    resolveCountryCode(normalizedReporter),
    resolveCountryCode(normalizedPartner),
  ]);
  let result: TradeMarginResult;

  const importerRecords = await getTradeRecords(reporterCode, partnerCode, normalizedCmdCode, 'M');
  if (partnerCode === 0) {
    result = calculateMargin(importerRecords, normalizedReporter, normalizedPartner, normalizedCmdCode);
  } else {
    const exporterRecords = await getTradeRecords(partnerCode, reporterCode, normalizedCmdCode, 'X');
    result = calculateImportExportMargin(
      importerRecords,
      exporterRecords,
      normalizedReporter,
      normalizedPartner,
      normalizedCmdCode,
    );
  }

  writeCache(cacheKey, result);
  return result;
}

export const COMTRADE_CACHE_TTL_MS = CACHE_TTL_MS;
