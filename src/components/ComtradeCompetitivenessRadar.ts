import { getTradeMargin, type TradeMarginResult } from '../services/comtradeApi';

type RadarStatus = 'green' | 'yellow' | 'red' | 'neutral';

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
        <label class="block">
          <span class="block text-xs font-medium text-slate-500 mb-1">Mercado importador</span>
          <input class="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 transition-colors" data-comtrade-reporter value="USA" maxlength="3" autocomplete="off" aria-label="ISO del mercado importador">
        </label>
        <label class="block">
          <span class="block text-xs font-medium text-slate-500 mb-1">Socio exportador</span>
          <input class="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 transition-colors" data-comtrade-partner value="WLD" maxlength="3" autocomplete="off" aria-label="ISO del socio exportador">
        </label>
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
        Introduce códigos ISO-2/ISO-3. Usa WLD para el total mundial.
      </p>
    </section>
  `;

  const reporterInput = root.querySelector<HTMLInputElement>('[data-comtrade-reporter]');
  const partnerInput = root.querySelector<HTMLInputElement>('[data-comtrade-partner]');
  const cmdSelect = root.querySelector<HTMLSelectElement>('[data-comtrade-cmd]');
  const loadButton = root.querySelector<HTMLButtonElement>('[data-comtrade-load]');
  let latestResult: TradeMarginResult | null = null;
  let previousFreight = -1;

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
      latestResult = await getTradeMargin(reporterInput.value, partnerInput.value, cmdSelect.value);
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

  loadButton?.addEventListener('click', loadMargin);
  const freightInput = document.getElementById('freight-sell');
  freightInput?.addEventListener('input', refreshFreight);
  freightInput?.addEventListener('change', refreshFreight);
  const pollingId = window.setInterval(refreshFreight, 750);
  refreshFreight();

  return () => {
    window.clearInterval(pollingId);
    loadButton?.removeEventListener('click', loadMargin);
    freightInput?.removeEventListener('input', refreshFreight);
    freightInput?.removeEventListener('change', refreshFreight);
  };
}
