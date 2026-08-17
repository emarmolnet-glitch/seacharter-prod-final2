import { getTradeMargin, type TradeMarginResult } from '../services/comtradeApi';
import { getComtradeHsCodeFamily } from '../data/comtradeHsCodes';
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
  CargoTypeSelector?: {
    readSelectedId?: () => string;
  };
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

function readSelectedCargoTypeId(routeWindow: RouteAwareWindow): string {
  const selector = document.getElementById('cargo-type-manual') as HTMLSelectElement | null;
  return String(selector?.value || routeWindow.CargoTypeSelector?.readSelectedId?.() || '').trim();
}

function replaceHsCodeOptions(select: HTMLSelectElement, cargoTypeId: string): boolean {
  const family = getComtradeHsCodeFamily(cargoTypeId);
  const fragment = document.createDocumentFragment();

  if (!family) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = cargoTypeId === '100'
      ? 'Sin códigos SA para “Otros”'
      : 'Selecciona una especificación de carga';
    fragment.appendChild(placeholder);
    select.replaceChildren(fragment);
    select.value = '';
    select.disabled = true;
    return false;
  }

  family.codes.forEach(({ code, label }) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = `${code} · ${label}`;
    fragment.appendChild(option);
  });
  select.replaceChildren(fragment);
  select.disabled = false;
  select.value = family.defaultCode;
  return true;
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
            <option value="">Selecciona una especificación de carga</option>
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
          <span class="relative inline-flex max-w-full items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-cyan-700 group">
            Diferencial absorbido en destino
            <button class="shrink-0 cursor-help text-[11px] leading-none opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 focus-visible:ring-offset-cyan-50" type="button" aria-describedby="comtrade-destination-differential-tooltip" aria-label="Aclaración sobre el diferencial absorbido en destino">ℹ️</button>
            <span id="comtrade-destination-differential-tooltip" class="invisible absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-slate-900 px-3 py-2.5 text-left text-xs font-normal normal-case leading-5 tracking-normal text-slate-100 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100" role="tooltip">⚠️ Este valor NO es un flete marítimo. Es el diferencial histórico (CIF-FOB) que el importador absorbió en destino para cubrir toda su logística. Tu flete debe ser inferior a este límite. El volumen mostrado en TM representa la suma total de todo el año, útil para medir tu cuota de mercado en este viaje.</span>
          </span>
          <strong class="mt-1 block font-mono text-lg font-bold text-slate-900" data-comtrade-margin>—</strong>
          <small class="mt-1 block text-xs text-slate-500" data-comtrade-period>Brecha CIF-FOB | Volumen Anual Total</small>
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
  let previousCargoTypeId = '';
  let activeRequestId = 0;

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

  const syncCargoHsCodes = (cargoTypeId = '') => {
    if (!cmdSelect) return;
    const normalizedCargoTypeId = String(cargoTypeId || readSelectedCargoTypeId(routeWindow)).trim();
    if (normalizedCargoTypeId === previousCargoTypeId) return;
    activeRequestId += 1;
    previousCargoTypeId = normalizedCargoTypeId;
    const hasCodes = replaceHsCodeOptions(cmdSelect, normalizedCargoTypeId);
    latestResult = null;
    renderComparison(root, null);
    setText(root, '[data-comtrade-period]', 'Brecha CIF-FOB | Volumen Anual Total');
    setText(
      root,
      '[data-comtrade-message]',
      hasCodes
        ? 'Código SA sugerido según la especificación de carga. Puedes elegir otra partida de la misma familia.'
        : 'Selecciona una especificación de carga compatible para consultar UN Comtrade.',
    );
    if (loadButton) {
      loadButton.disabled = !hasCodes;
      loadButton.classList.remove('is-loading');
    }
  };

  const loadMargin = async () => {
    if (!reporterInput || !partnerInput || !cmdSelect || !loadButton) return;
    if (!cmdSelect.value) {
      setText(root, '[data-comtrade-message]', 'Selecciona una especificación de carga antes de consultar UN Comtrade.');
      return;
    }
    const requestId = ++activeRequestId;
    const requestedCmdCode = cmdSelect.value;
    loadButton.disabled = true;
    loadButton.classList.add('is-loading');
    setText(root, '[data-comtrade-message]', 'Consultando datos anuales de UN Comtrade…');

    try {
      const result = await getTradeMargin(reporterCombobox.getM49(), partnerCombobox.getM49(), requestedCmdCode);
      if (requestId !== activeRequestId || cmdSelect.value !== requestedCmdCode) return;
      latestResult = result;
      renderComparison(root, latestResult);
      setText(root, '[data-comtrade-period]', `Brecha CIF-FOB | Volumen Anual Total (${latestResult.period}): ${latestResult.netWeightMt.toLocaleString('en-US', { maximumFractionDigits: 0 })} TM`);
      setText(root, '[data-comtrade-message]', `Datos ${latestResult.source} almacenados localmente durante siete días.`);
    } catch (error) {
      if (requestId !== activeRequestId) return;
      latestResult = null;
      renderComparison(root, null);
      setText(root, '[data-comtrade-period]', 'Brecha CIF-FOB | Volumen Anual Total');
      setText(root, '[data-comtrade-message]', error instanceof Error ? error.message : 'No se pudo consultar UN Comtrade.');
      root.dataset.radarStatus = 'error';
    } finally {
      if (requestId === activeRequestId) {
        loadButton.disabled = !cmdSelect.value;
        loadButton.classList.remove('is-loading');
      }
    }
  };

  const handleLoadClick = () => {
    void loadMargin();
  };
  const resetPendingQuery = () => {
    activeRequestId += 1;
    latestResult = null;
    renderComparison(root, null);
    setText(root, '[data-comtrade-period]', 'Brecha CIF-FOB | Volumen Anual Total');
    setText(root, '[data-comtrade-message]', 'Selección actualizada. Pulsa “Consultar radar” para solicitar datos a UN Comtrade.');
    loadButton?.classList.remove('is-loading');
    if (loadButton) loadButton.disabled = !cmdSelect?.value;
  };
  reporterCombobox = createCountryCombobox({
    defaultIso: 'USA',
    inputLabel: 'Mercado importador',
    inputSelector: '[data-comtrade-reporter]',
    listSelector: '[data-comtrade-reporter-options]',
    onChange: resetPendingQuery,
    root,
  });
  partnerCombobox = createCountryCombobox({
    defaultIso: 'WLD',
    includeWorld: true,
    inputLabel: 'Socio exportador',
    inputSelector: '[data-comtrade-partner]',
    listSelector: '[data-comtrade-partner-options]',
    onChange: resetPendingQuery,
    root,
  });

  loadButton?.addEventListener('click', handleLoadClick);
  cmdSelect?.addEventListener('change', resetPendingQuery);
  const freightInput = document.getElementById('freight-sell');
  freightInput?.addEventListener('input', refreshFreight);
  freightInput?.addEventListener('change', refreshFreight);
  const routeWindow = window as RouteAwareWindow;
  const cargoTypeInput = document.getElementById('cargo-type-manual');
  const handleCargoTypeInput = () => syncCargoHsCodes();
  const handleCargoTypeChanged = (event: Event) => {
    const detail = (event as CustomEvent<{ cargoType?: { id?: string } }>).detail;
    syncCargoHsCodes(detail?.cargoType?.id || '');
  };
  cargoTypeInput?.addEventListener('change', handleCargoTypeInput);
  cargoTypeInput?.addEventListener('input', handleCargoTypeInput);
  window.addEventListener('CARGO_TYPE_CHANGED', handleCargoTypeChanged);
  syncCargoHsCodes();
  const handleRouteDefined = (event: Event) => syncRouteCountries((event as CustomEvent<RouteCountryState>).detail || {});
  window.addEventListener('SEA_ROUTE_DEFINED', handleRouteDefined);
  const unsubscribeRouteStore = routeWindow.SeaCharterStore?.subscribe?.(syncRouteCountries);
  syncRouteCountries(routeWindow.SeaCharterStore?.getState?.() || routeWindow.GlobalStore || {});
  const pollingId = window.setInterval(refreshFreight, 750);
  refreshFreight();

  return () => {
    window.clearInterval(pollingId);
    loadButton?.removeEventListener('click', handleLoadClick);
    cmdSelect?.removeEventListener('change', resetPendingQuery);
    freightInput?.removeEventListener('input', refreshFreight);
    freightInput?.removeEventListener('change', refreshFreight);
    cargoTypeInput?.removeEventListener('change', handleCargoTypeInput);
    cargoTypeInput?.removeEventListener('input', handleCargoTypeInput);
    window.removeEventListener('CARGO_TYPE_CHANGED', handleCargoTypeChanged);
    window.removeEventListener('SEA_ROUTE_DEFINED', handleRouteDefined);
    unsubscribeRouteStore?.();
    reporterCombobox.destroy();
    partnerCombobox.destroy();
  };
}
