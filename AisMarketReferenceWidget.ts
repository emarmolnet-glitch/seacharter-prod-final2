export type AisMarketScenarioId = 'fair' | 'standard' | 'offmarket';

declare const aisMarketRateBrand: unique symbol;
export type AisMarketRate = number & { readonly [aisMarketRateBrand]: true };
export type AisMarketRates = Readonly<Record<AisMarketScenarioId, AisMarketRate>>;

type AisMarketScenario = Readonly<{
    id: AisMarketScenarioId;
    label: string;
    description: string;
    tone: 'optimal' | 'standard' | 'warning';
}>;

type AisMarketReferenceWidgetOptions = Readonly<{
    onApplyRate: (rate: AisMarketRate) => boolean;
}>;

declare global {
    interface Window {
        aisMarketFreightRates?: AisMarketRates;
        syncChartererFreightFromOwner?: (ownerFreight: number) => number | null;
        GlobalStore?: {
            hasAisData?: boolean;
            nearbyCount?: number;
        };
    }

    interface WindowEventMap {
        AIS_MARKET_RATES_UPDATED: CustomEvent<AisMarketRates>;
        AIS_MARKET_AVAILABILITY_CHANGED: CustomEvent<{ hasAisData: boolean }>;
    }
}

const AIS_MARKET_RATES_UPDATED_EVENT = 'AIS_MARKET_RATES_UPDATED' as const;
const AIS_MARKET_AVAILABILITY_CHANGED_EVENT = 'AIS_MARKET_AVAILABILITY_CHANGED' as const;
const AIS_MARKET_SCENARIOS: readonly AisMarketScenario[] = Object.freeze([
    Object.freeze({
        id: 'fair',
        label: 'Flete Justo',
        description: 'Referencia óptima AIS',
        tone: 'optimal',
    }),
    Object.freeze({
        id: 'standard',
        label: 'Flete Estándar',
        description: 'Banda operativa de mercado',
        tone: 'standard',
    }),
    Object.freeze({
        id: 'offmarket',
        label: 'Fuera de Mercado',
        description: 'Prima comercial elevada',
        tone: 'warning',
    }),
]);
const AIS_RATE_ELEMENT_IDS: Readonly<Record<AisMarketScenarioId, string>> = Object.freeze({
    fair: 'ais-rate-fair',
    standard: 'ais-rate-standard',
    offmarket: 'ais-rate-offmarket',
});
const OWNER_FREIGHT_INPUT_ID = 'freight-rate';
const CHARTERER_FREIGHT_INPUT_ID = 'freight-sell';
const WIDGET_HOST_ID = 'ais-market-reference-widget';

function parseAisMarketRate(value: unknown): AisMarketRate | null {
    const parsedValue = typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue as AisMarketRate : null;
}

function normalizeAisMarketRates(value: unknown): AisMarketRates | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<Record<AisMarketScenarioId, unknown>>;
    const fair = parseAisMarketRate(candidate.fair);
    const standard = parseAisMarketRate(candidate.standard);
    const offmarket = parseAisMarketRate(candidate.offmarket);
    if (fair === null || standard === null || offmarket === null) return null;
    return Object.freeze({ fair, standard, offmarket });
}

function readAisMarketRatesFromEngine(): AisMarketRates | null {
    const stateRates = normalizeAisMarketRates(window.aisMarketFreightRates);
    if (stateRates) return stateRates;

    return normalizeAisMarketRates({
        fair: document.getElementById(AIS_RATE_ELEMENT_IDS.fair)?.textContent,
        standard: document.getElementById(AIS_RATE_ELEMENT_IDS.standard)?.textContent,
        offmarket: document.getElementById(AIS_RATE_ELEMENT_IDS.offmarket)?.textContent,
    });
}

function hasConfirmedAisData(): boolean {
    return window.GlobalStore?.hasAisData === true
        && Number(window.GlobalStore?.nearbyCount) > 0;
}

export function handleApplyAisRate(rate: AisMarketRate): boolean {
    const ownerFreightInput = document.getElementById(OWNER_FREIGHT_INPUT_ID);
    const chartererFreightInput = document.getElementById(CHARTERER_FREIGHT_INPUT_ID);
    if (
        !(ownerFreightInput instanceof HTMLInputElement)
        || !(chartererFreightInput instanceof HTMLInputElement)
        || typeof window.syncChartererFreightFromOwner !== 'function'
    ) return false;

    ownerFreightInput.value = rate.toFixed(2);
    const chartererFreight = window.syncChartererFreightFromOwner(rate);
    if (chartererFreight === null) return false;

    const emitReactiveEvents = (input: HTMLInputElement): void => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    emitReactiveEvents(ownerFreightInput);
    emitReactiveEvents(chartererFreightInput);
    return true;
}

export class AisMarketReferenceWidget {
    readonly #host: HTMLElement;
    readonly #options: AisMarketReferenceWidgetOptions;
    #rates: AisMarketRates | null = null;
    #eventController = new AbortController();

    constructor(host: HTMLElement, options: AisMarketReferenceWidgetOptions) {
        this.#host = host;
        this.#options = options;
    }

    mount(): void {
        this.#eventController.abort();
        this.#eventController = new AbortController();
        this.#host.classList.add('ais-market-reference-widget');
        this.#host.setAttribute('aria-label', 'Referencia de Mercado AIS');
        this.#host.replaceChildren(this.#buildHeader(), this.#buildScenarioList(), this.#buildStatus());
        window.addEventListener(AIS_MARKET_RATES_UPDATED_EVENT, (event) => {
            if (!hasConfirmedAisData()) {
                this.#renderPending();
                return;
            }
            const rates = normalizeAisMarketRates(event.detail);
            if (rates) this.#renderRates(rates);
        }, { signal: this.#eventController.signal });
        window.addEventListener(AIS_MARKET_AVAILABILITY_CHANGED_EVENT, (event) => {
            if (event.detail?.hasAisData !== true) {
                this.#renderPending();
                return;
            }
            const rates = readAisMarketRatesFromEngine();
            if (rates) this.#renderRates(rates);
        }, { signal: this.#eventController.signal });

        if (!hasConfirmedAisData()) {
            this.#renderPending();
            return;
        }
        const engineRates = readAisMarketRatesFromEngine();
        if (engineRates) this.#renderRates(engineRates);
    }

    #buildHeader(): HTMLElement {
        const header = document.createElement('header');
        header.className = 'ais-market-reference-widget__header';

        const eyebrow = document.createElement('span');
        eyebrow.className = 'ais-market-reference-widget__eyebrow';
        eyebrow.textContent = 'AIS · LIVE';

        const title = document.createElement('h3');
        title.className = 'ais-market-reference-widget__title';
        title.textContent = 'Referencia de Mercado AIS';

        header.append(title, eyebrow);
        return header;
    }

    #buildScenarioList(): HTMLElement {
        const list = document.createElement('div');
        list.className = 'ais-market-reference-widget__scenarios';

        AIS_MARKET_SCENARIOS.forEach((scenario) => {
            list.append(this.#buildScenario(scenario));
        });

        return list;
    }

    #buildScenario(scenario: AisMarketScenario): HTMLElement {
        const article = document.createElement('article');
        article.className = `ais-market-reference-widget__scenario ais-market-reference-widget__scenario--${scenario.tone}`;

        const content = document.createElement('div');
        content.className = 'ais-market-reference-widget__scenario-content';

        const label = document.createElement('span');
        label.className = 'ais-market-reference-widget__scenario-label';
        label.textContent = scenario.label;

        const description = document.createElement('span');
        description.className = 'ais-market-reference-widget__scenario-description';
        description.textContent = scenario.description;

        const rate = document.createElement('strong');
        rate.className = 'ais-market-reference-widget__rate';
        rate.dataset.aisRate = scenario.id;
        rate.textContent = '--.--$';

        const unit = document.createElement('span');
        unit.className = 'ais-market-reference-widget__unit';
        unit.textContent = 'USD / MT';

        const button = document.createElement('button');
        button.className = 'ais-market-reference-widget__apply';
        button.type = 'button';
        button.disabled = true;
        button.dataset.aisApply = scenario.id;
        button.textContent = 'Aplicar';
        button.setAttribute('aria-label', `Aplicar ${scenario.label} al flete de compra del armador`);
        button.addEventListener('click', () => this.#applyScenario(scenario));

        content.append(label, description);
        article.append(content, rate, unit, button);
        return article;
    }

    #buildStatus(): HTMLElement {
        const status = document.createElement('p');
        status.className = 'ais-market-reference-widget__status';
        status.dataset.aisMarketStatus = '';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.textContent = 'Pendiente: ejecuta el barrido radar para habilitar el mercado AIS.';
        return status;
    }

    #renderPending(): void {
        this.#rates = null;
        this.#host.dataset.aisMarketState = 'pending';
        AIS_MARKET_SCENARIOS.forEach((scenario) => {
            const rateElement = this.#host.querySelector<HTMLElement>(`[data-ais-rate="${scenario.id}"]`);
            const applyButton = this.#host.querySelector<HTMLButtonElement>(`[data-ais-apply="${scenario.id}"]`);
            if (rateElement) rateElement.textContent = '--.--$';
            if (applyButton) applyButton.disabled = true;
        });

        const status = this.#getStatus();
        if (status) {
            status.dataset.state = 'pending';
            status.textContent = 'Pendiente: ejecuta el barrido radar para habilitar el mercado AIS.';
        }
    }

    #renderRates(rates: AisMarketRates): void {
        if (!hasConfirmedAisData()) {
            this.#renderPending();
            return;
        }
        this.#rates = rates;
        this.#host.dataset.aisMarketState = 'ready';
        AIS_MARKET_SCENARIOS.forEach((scenario) => {
            const rateElement = this.#host.querySelector<HTMLElement>(`[data-ais-rate="${scenario.id}"]`);
            const applyButton = this.#host.querySelector<HTMLButtonElement>(`[data-ais-apply="${scenario.id}"]`);
            if (rateElement) rateElement.textContent = `$${rates[scenario.id].toFixed(2)}`;
            if (applyButton) applyButton.disabled = false;
        });

        const status = this.#getStatus();
        if (status) {
            status.dataset.state = 'synced';
            status.textContent = 'Sincronizado con el algoritmo de densidad y flete AIS.';
        }
    }

    #applyScenario(scenario: AisMarketScenario): void {
        if (!hasConfirmedAisData()) {
            this.#renderPending();
            return;
        }
        const rate = this.#rates?.[scenario.id];
        const status = this.#getStatus();
        if (!rate || !status) return;

        const applied = this.#options.onApplyRate(rate);
        status.dataset.state = applied ? 'success' : 'error';
        status.textContent = applied
            ? `${scenario.label} aplicado; compra del armador y venta del fletador sincronizadas.`
            : 'No se pudo sincronizar el flete del armador con la venta del fletador.';
    }

    #getStatus(): HTMLElement | null {
        return this.#host.querySelector<HTMLElement>('[data-ais-market-status]');
    }
}

function mountAisMarketReferenceWidget(): void {
    const host = document.getElementById(WIDGET_HOST_ID);
    if (!host) return;

    new AisMarketReferenceWidget(host, { onApplyRate: handleApplyAisRate }).mount();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAisMarketReferenceWidget, { once: true });
} else {
    mountAisMarketReferenceWidget();
}
