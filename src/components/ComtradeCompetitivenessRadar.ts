import { getTradeMargin, type TradeMarginResult } from '../services/comtradeApi';
import { findUnCountry } from '../data/unCountries';
import { createCountryCombobox, type CountryComboboxController } from './CountryCombobox';

type RadarStatus = 'green' | 'yellow' | 'red' | 'neutral';

type RouteCountryState = {
  destinationCountry?: string;
  geopoliticalRoute?: RouteCountryState;
  originCountry?: string;
  pod?: string;
  podIso?: string;
  pol?: string;
  polIso?: string;
  routeGeometry?: {
    coordinates?: {
      pod?: { countryCode?: string };
      pol?: { countryCode?: string };
    };
  };
};

type RouteAwareWindow = Window & typeof globalThis & {
  GlobalStore?: RouteCountryState;
  SeaCharterStore?: {
    getState?: () => RouteCountryState;
    subscribe?: (listener: (state: RouteCountryState) => void) => (() => void);
  };
};

const MONEY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STATUS_BADGE_CLASSES: Record<RadarStatus, string> = {
  green: 'flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm font-semibold w-full',
  yellow: 'flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm font-semibold w-full',
  red: 'flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm font-semibold w-full',
  neutral: 'flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-600 px-4 py-3 rounded-lg text-sm font-semibold w-full',
};

const COMTRADE_DEBOUNCE_MS = 1500;

type DebouncedCallback = (() => void) & { cancel: () => void };

function debounce(callback: () => void, waitMilliseconds: number): DebouncedCallback {
  let timeoutId: number | undefined;
  const debouncedCallback = (() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      timeoutId = undefined;
      callback();
    }, waitMilliseconds);
  }) as DebouncedCallback;

  debouncedCallback.cancel = () => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    timeoutId = undefined;
  };
  return debouncedCallback;
}

function readSeaCharterFreight(): number {
  const freightInput = document.getElementById('freight-sell') as HTMLInputElement | null;
  const value = Number(freightInput?.value);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function getRadarStatus(freight: number, margin: number): RadarStatus {
  if (!(margin > 0) || !(freight >= 0)) return 'neutral';
  if (freight <= margin * 0.8) return 'green';
  if (freight <= margin) return 'yellow';
  return 'red';
}

function getStatusCopy(status: RadarStatus): { title: string; detail: string } {
  if (status === 'green') return {
    title: 'Ventaja competitiva',
    detail: 'El flete SeaCharter utiliza hasta el 80% del margen logístico observado.',
  };
  if (status === 'yellow') return {
    title: 'Margen ajustado',
    detail: 'El flete se mantiene dentro del margen, con poca holgura de negociación.',
  };
  if (status === 'red') return {
    title: 'Presión comercial',
    detail: 'El flete supera el margen logístico estimado por UN Comtrade.',
  };
  return {
    title: 'Pendiente de datos',
    detail: 'Consulta Comtrade para activar la comparación comercial.',
  };
}

function setText(root: HTMLElement, selector: string, value: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function readCountryIso(...values: unknown[]): string {
  for (const value of values) {
    const normalizedValue = String(value || '').trim().toUpperCase();
    if (/^[A-Z]{2,3}$/.test(normalizedValue)) return normalizedValue;
    const labelMatch = normalizedValue.match(/\(([A-Z]{2,3})\)\s*$/);
    if (labelMatch) return labelMatch[1];
    const country = findUnCountry(String(value || ''));
    if (country) return country.iso3;
  }
  return '';
}

function getRouteCountryPair(state: RouteCountryState = {}): { exporterIso: string; importerIso: string } {
  const route = state.geopoliticalRoute || {};
  return {
    exporterIso: readCountryIso(
      state.originCountry,
      state.polIso,
      state.routeGeometry?.coordinates?.pol?.countryCode,
      route.originCountry,
      route.polIso,
      state.pol,
      route.pol,
    ),
    importerIso: readCountryIso(
      state.destinationCountry,
      state.podIso,
      state.routeGeometry?.coordinates?.pod?.countryCode,
      route.destinationCountry,
      route.podIso,
      state.pod,
      route.pod,
    ),
  };
}

function renderComparison(root: HTMLElement, result: TradeMarginResult | null): void {
  const freight = readSeaCharterFreight();
  const margin = Number(result?.logisticsMarginPerMt || 0);
  const status = getRadarStatus(freight, margin);
  const copy = getStatusCopy(status);
  const signal = root.querySelector<HTMLElement>('[data-comtrade-signal]');

  root.dataset.radarStatus = status;
  if (signal) {
    signal.dataset.status = status;
    signal.className = STATUS_BADGE_CLASSES[status];
  }
  setText(root, '[data-comtrade-freight]', `${MONEY_FORMATTER.format(freight)} /TM`);
  setText(root, '[data-comtrade-margin]', result ? `${MONEY_FORMATTER.format(margin)} /TM` : '—');
  setText(root, '[data-comtrade-status-title]', copy.title);
  setText(root, '[data-comtrade-status-detail]', copy.detail);
}

export function ComtradeCompetitivenessRadar(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mt-6" aria-labelledby="comtrade-radar-title">
      <header class="mb-5 border-b border-slate-100 pb-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="comtrade-radar-title" class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                <i class="fa-solid fa-compass" aria-hidden="true"></i>
              </span>
              Radar de Competitividad <span class="text-slate-400">UN Comtrade</span>
            </h3>
            <p class="max-w-2xl text-sm leading-6 text-slate-500">Contrasta el flete de venta por tonelada con la brecha CIF–FOB del mercado importador.</p>
          </div>
          <div class="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500" title="Los resultados se guardan localmente durante siete días.">
            <i class="fa-solid fa-database text-cyan-600" aria-hidden="true"></i>
            Caché 7 días
          </div>
        </div>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div class="relative">
          <label class="block text-xs font-medium text-slate-500 mb-1" for="comtrade-reporter-country">Mercado importador</label>
          <div class="relative">
            <input id="comtrade-reporter-country" class="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 pr-10 transition-colors" data-comtrade-reporter type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="comtrade-reporter-options" placeholder="Buscar país o código ISO">
            <i class="fa-solid fa-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true"></i>
          </div>
          <div id="comtrade-reporter-options" class="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10" data-comtrade-reporter-options role="listbox" hidden></div>
        </div>
        <div class="relative">
          <label class="block text-xs font-medium text-slate-500 mb-1" for="comtrade-partner-country">Socio exportador</label>
          <div class="relative">
            <input id="comtrade-partner-country" class="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 pr-10 transition-colors" data-comtrade-partner type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="comtrade-partner-options" placeholder="Buscar país o código ISO">
            <i class="fa-solid fa-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true"></i>
          </div>
          <div id="comtrade-partner-options" class="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10" data-comtrade-partner-options role="listbox" hidden></div>
        </div>
        <label class="block md:col-span-2">
          <span class="block text-xs font-medium text-slate-500 mb-1">Código SA</span>
          <select class="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 transition-colors" data-comtrade-cmd aria-label="Código del Sistema Armonizado">
            <option value="252310">252310 · Clinker de cemento</option>
            <option value="252321">252321 · Cemento Portland blanco</option>
            <option value="252329">252329 · Los demás cementos Portland</option>
            <option value="252390">252390 · Otros cementos hidráulicos</option>
            <option value="2523">2523 · Cementos hidráulicos (agregado)</option>
          </select>
        </label>
      </div>

      <div class="mb-5 flex justify-start">
        <button class="w-full md:w-auto bg-slate-900 text-white font-medium rounded-lg text-sm px-6 py-2.5 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-60" type="button" data-comtrade-load>
          <i class="fa-solid fa-satellite-dish" aria-hidden="true"></i>
          Consultar radar
        </button>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2" aria-live="polite">
        <div class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <span class="block text-xs font-medium uppercase tracking-wide text-slate-400">Flete SeaCharter</span>
          <strong class="mt-1 block font-mono text-lg font-bold text-slate-900" data-comtrade-freight>$0.00 /TM</strong>
          <small class="mt-1 block text-xs text-slate-500">Venta calculada, solo lectura</small>
        </div>
        <div class="rounded-lg border border-cyan-100 bg-cyan-50/60 px-4 py-3">
          <span class="block text-xs font-medium uppercase tracking-wide text-cyan-700">Margen logístico estimado</span>
          <strong class="mt-1 block font-mono text-lg font-bold text-slate-900" data-comtrade-margin>—</strong>
          <small class="mt-1 block text-xs text-slate-500" data-comtrade-period>Precio CIF − Precio FOB</small>
        </div>
        <div class="md:col-span-2">
          <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-600 px-4 py-3 rounded-lg text-sm font-semibold w-full" data-comtrade-signal data-status="neutral">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm" aria-hidden="true">
              <i class="fa-solid fa-gauge-high"></i>
            </span>
            <div class="min-w-0">
              <span class="block" data-comtrade-status-title>Pendiente de datos</span>
              <p class="mt-0.5 text-xs font-normal opacity-80" data-comtrade-status-detail>Consulta Comtrade para activar la comparación comercial.</p>
            </div>
          </div>
        </div>
      </div>
      <p class="mt-3 flex items-center gap-2 text-xs text-slate-400" data-comtrade-message>
        <i class="fa-solid fa-circle-info text-cyan-600" aria-hidden="true"></i>
        Busca por nombre, ISO-2, ISO-3 o código M49. La ruta activa completa ambos países automáticamente.
      </p>
    </section>
  `;

  const reporterInput = root.querySelector<HTMLInputElement>('[data-comtrade-reporter]');
  const partnerInput = root.querySelector<HTMLInputElement>('[data-comtrade-partner]');
  const cmdSelect = root.querySelector<HTMLSelectElement>('[data-comtrade-cmd]');
  const loadButton = root.querySelector<HTMLButtonElement>('[data-comtrade-load]');
  let reporterCombobox: CountryComboboxController;
  let partnerCombobox: CountryComboboxController;
  let latestResult: TradeMarginResult | null = null;
  let previousFreight = -1;
  let previousRouteKey = '';

  const syncRouteCountries = (state: RouteCountryState = {}) => {
    const { exporterIso, importerIso } = getRouteCountryPair(state);
    const routeKey = `${exporterIso}:${importerIso}`;
    if (routeKey === ':' || routeKey === previousRouteKey) return;
    const exporterSelected = exporterIso ? partnerCombobox.selectIso(exporterIso) : false;
    const importerSelected = importerIso ? reporterCombobox.selectIso(importerIso) : false;
    if (exporterSelected || importerSelected) previousRouteKey = routeKey;
  };

  const refreshFreight = () => {
    const freight = readSeaCharterFreight();
    if (freight === previousFreight) return;
    previousFreight = freight;
    renderComparison(root, latestResult);
  };

  const loadMargin = async () => {
    if (!reporterInput || !partnerInput || !cmdSelect || !loadButton) return;
    loadButton.disabled = true;
    loadButton.classList.add('is-loading');
    setText(root, '[data-comtrade-message]', 'Consultando datos anuales de UN Comtrade…');

    try {
      latestResult = await getTradeMargin(reporterCombobox.getValue(), partnerCombobox.getValue(), cmdSelect.value);
      renderComparison(root, latestResult);
      setText(root, '[data-comtrade-period]', `CIF − FOB · ${latestResult.period} · ${latestResult.netWeightMt.toLocaleString('en-US', { maximumFractionDigits: 0 })} TM`);
      setText(root, '[data-comtrade-message]', `Datos ${latestResult.source} almacenados localmente durante siete días.`);
    } catch (error) {
      latestResult = null;
      renderComparison(root, null);
      setText(root, '[data-comtrade-period]', 'Precio CIF − Precio FOB');
      setText(root, '[data-comtrade-message]', error instanceof Error ? error.message : 'No se pudo consultar UN Comtrade.');
      root.dataset.radarStatus = 'error';
    } finally {
      loadButton.disabled = false;
      loadButton.classList.remove('is-loading');
    }
  };

  const debouncedLoadMargin = debounce(() => void loadMargin(), COMTRADE_DEBOUNCE_MS);
  const handleLoadClick = () => {
    debouncedLoadMargin.cancel();
    void loadMargin();
  };
  reporterCombobox = createCountryCombobox({
    defaultIso: 'USA',
    inputLabel: 'Mercado importador',
    inputSelector: '[data-comtrade-reporter]',
    listSelector: '[data-comtrade-reporter-options]',
    onChange: debouncedLoadMargin,
    root,
  });
  partnerCombobox = createCountryCombobox({
    defaultIso: 'WLD',
    includeWorld: true,
    inputLabel: 'Socio exportador',
    inputSelector: '[data-comtrade-partner]',
    listSelector: '[data-comtrade-partner-options]',
    onChange: debouncedLoadMargin,
    root,
  });

  loadButton?.addEventListener('click', handleLoadClick);
  cmdSelect?.addEventListener('change', debouncedLoadMargin);
  const freightInput = document.getElementById('freight-sell');
  freightInput?.addEventListener('input', refreshFreight);
  freightInput?.addEventListener('change', refreshFreight);
  const routeWindow = window as RouteAwareWindow;
  const handleRouteDefined = (event: Event) => syncRouteCountries((event as CustomEvent<RouteCountryState>).detail || {});
  window.addEventListener('SEA_ROUTE_DEFINED', handleRouteDefined);
  const unsubscribeRouteStore = routeWindow.SeaCharterStore?.subscribe?.(syncRouteCountries);
  syncRouteCountries(routeWindow.SeaCharterStore?.getState?.() || routeWindow.GlobalStore || {});
  const pollingId = window.setInterval(refreshFreight, 750);
  refreshFreight();

  return () => {
    window.clearInterval(pollingId);
    debouncedLoadMargin.cancel();
    loadButton?.removeEventListener('click', handleLoadClick);
    cmdSelect?.removeEventListener('change', debouncedLoadMargin);
    freightInput?.removeEventListener('input', refreshFreight);
    freightInput?.removeEventListener('change', refreshFreight);
    window.removeEventListener('SEA_ROUTE_DEFINED', handleRouteDefined);
    unsubscribeRouteStore?.();
    reporterCombobox.destroy();
    partnerCombobox.destroy();
  };
}
