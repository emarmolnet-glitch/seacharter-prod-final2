class DualTradingCharteringView extends HTMLElement {
    #draft = {
        fobPrice: '',
        cifPrice: '',
        totalTonnage: '',
        stowageFactor: '',
        cargoTolerance: '',
    };

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.shadowRoot.querySelectorAll('[data-dual-input]').forEach((input) => {
            input.addEventListener('input', (event) => {
                this.#draft[event.currentTarget.name] = event.currentTarget.value;
                this.#renderGrossMargin();
            });
        });
        this.#renderGrossMargin();
    }

    #renderGrossMargin() {
        const fobPrice = Number(this.#draft.fobPrice || 0);
        const cifPrice = Number(this.#draft.cifPrice || 0);
        const grossMargin = cifPrice - fobPrice;
        const marginOutput = this.shadowRoot.getElementById('dual-gross-margin');
        if (!marginOutput) return;

        const normalizedMargin = Number.isFinite(grossMargin) ? grossMargin : 0;
        const formattedMargin = Math.abs(normalizedMargin).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        marginOutput.textContent = `${normalizedMargin < 0 ? '-' : ''}$ ${formattedMargin} / TM`;
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    --ink: #1e293b;
                    --muted: #64748b;
                    --line: #cbd5e1;
                    --paper: #f8fafc;
                    --surface: #ffffff;
                    --navy: #002060;
                    --teal: #25a18e;
                    --signal: #25a18e;
                    display: block;
                    min-height: 100vh;
                    color: var(--ink);
                    background: #ffffff;
                    font-family: Inter, Roboto, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }

                *, *::before, *::after {
                    box-sizing: border-box;
                }

                a, button, input {
                    font: inherit;
                }

                .shell {
                    width: min(1180px, calc(100% - 32px));
                    margin: 0 auto;
                    padding: 24px 0 40px;
                }

                .topbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 20px;
                    margin-bottom: 24px;
                    padding-bottom: 16px;
                    border-bottom: 1px solid #e2e8f0;
                }

                .brand {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    color: var(--navy);
                    font-size: 0.78rem;
                    font-weight: 800;
                    letter-spacing: 0.11em;
                    text-transform: uppercase;
                }

                .brand-mark {
                    display: grid;
                    width: 38px;
                    height: 38px;
                    place-items: center;
                    border: 1px solid #cbd5e1;
                    border-radius: 10px;
                    color: #ffffff;
                    background: var(--navy);
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
                }

                .brand-mark svg,
                .back-link svg,
                .lock svg {
                    width: 18px;
                    height: 18px;
                }

                .back-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 40px;
                    padding: 0 14px;
                    border: 1px solid #94a3b8;
                    border-radius: 8px;
                    color: var(--navy);
                    background: #ffffff;
                    font-size: 0.78rem;
                    font-weight: 800;
                    text-decoration: none;
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
                    transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
                }

                .back-link:hover {
                    border-color: var(--teal);
                    background: #f8fafc;
                    box-shadow: 0 0 0 2px rgba(37, 161, 142, 0.16);
                }

                .back-link:focus-visible,
                input:focus-visible {
                    outline: 3px solid rgba(37, 161, 142, 0.22);
                    outline-offset: 2px;
                }

                .intro {
                    display: grid;
                    grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
                    align-items: center;
                    gap: 28px;
                    margin-bottom: 20px;
                }

                .eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0 0 8px;
                    color: #64748b;
                    font-size: 0.68rem;
                    font-weight: 700;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                }

                .eyebrow::before {
                    width: 22px;
                    height: 2px;
                    background: #25a18e;
                    content: "";
                }

                h1 {
                    max-width: 780px;
                    margin: 0;
                    color: var(--navy);
                    font-family: inherit;
                    font-size: clamp(1.5rem, 3vw, 2rem);
                    font-weight: 800;
                    letter-spacing: -0.02em;
                    line-height: 1.2;
                }

                .intro-copy {
                    margin: 0 0 8px;
                    color: var(--muted);
                    font-size: 0.78rem;
                    line-height: 1.55;
                }

                .isolation-note {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-top: 10px;
                    color: var(--navy);
                    font-size: 0.74rem;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                }

                .isolation-note::before {
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    background: #2a9d8f;
                    box-shadow: 0 0 0 3px rgba(42, 157, 143, 0.12);
                    content: "";
                }

                .workspace {
                    display: grid;
                    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    background: var(--surface);
                    box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.08);
                }

                .column {
                    min-height: 390px;
                    padding: clamp(24px, 3vw, 34px);
                }

                .trading-column {
                    border-right: 1px solid var(--line);
                }

                .chartering-column {
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    background: #f8fafc;
                    color: var(--ink);
                }

                .chartering-column::after {
                    display: none;
                }

                .section-index {
                    display: block;
                    margin-bottom: 12px;
                    color: #64748b;
                    font-size: 0.65rem;
                    font-weight: 700;
                    letter-spacing: 0.12em;
                }

                h2 {
                    margin: 0;
                    font-family: inherit;
                    color: #1e293b;
                    font-size: 0.82rem;
                    font-weight: 700;
                    letter-spacing: 0.12em;
                    line-height: 1.35;
                    text-transform: uppercase;
                }

                .section-description {
                    max-width: 480px;
                    margin: 8px 0 24px;
                    color: var(--muted);
                    font-size: 0.75rem;
                    line-height: 1.5;
                }

                .chartering-column .section-description {
                    color: #64748b;
                }

                .fields {
                    display: grid;
                    gap: 14px;
                }

                label {
                    display: grid;
                    gap: 6px;
                    color: #334155;
                    font-size: 0.7rem;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }

                .input-wrap {
                    position: relative;
                }

                input {
                    width: 100%;
                    height: 44px;
                    padding: 0.55rem 82px 0.55rem 0.8rem;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    color: var(--ink);
                    background: #ffffff;
                    font-size: 0.85rem;
                    font-weight: 600;
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
                    transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
                }

                input:hover,
                input:focus {
                    border-color: var(--teal);
                    box-shadow: 0 0 0 2px rgba(37, 161, 142, 0.16);
                }

                .unit {
                    position: absolute;
                    top: 50%;
                    right: 15px;
                    color: var(--muted);
                    font-size: 0.68rem;
                    font-weight: 900;
                    letter-spacing: 0.06em;
                    transform: translateY(-50%);
                }

                .placeholder {
                    position: relative;
                    z-index: 1;
                    display: grid;
                    flex: 1;
                    min-height: 190px;
                    place-items: center;
                    padding: 24px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    background: #ffffff;
                    text-align: center;
                    box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
                }

                .lock {
                    display: grid;
                    width: 54px;
                    height: 54px;
                    margin: 0 auto 18px;
                    place-items: center;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    color: #004e64;
                    background: #f1f5f9;
                }

                .placeholder strong {
                    display: block;
                    margin-bottom: 8px;
                    font-family: inherit;
                    color: #1e293b;
                    font-size: 0.82rem;
                    font-weight: 700;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                }

                .placeholder p {
                    max-width: 300px;
                    margin: 0 auto;
                    color: #64748b;
                    font-size: 0.75rem;
                    line-height: 1.5;
                }

                .read-only-badge {
                    display: inline-flex;
                    margin-top: 18px;
                    padding: 7px 10px;
                    border: 1px solid #99f6e4;
                    border-radius: 6px;
                    color: #115e59;
                    background: #f0fdfa;
                    font-size: 0.64rem;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                }

                @media (max-width: 760px) {
                    .shell {
                        width: min(100% - 22px, 620px);
                        padding-top: 16px;
                    }

                    .topbar {
                        margin-bottom: 40px;
                    }

                    .brand span:last-child {
                        display: none;
                    }

                    .intro,
                    .workspace {
                        grid-template-columns: 1fr;
                    }

                    .intro {
                        gap: 22px;
                    }

                    .trading-column {
                        border-right: 0;
                        border-bottom: 1px solid var(--line);
                    }

                    .column {
                        min-height: auto;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    *, *::before, *::after {
                        scroll-behavior: auto !important;
                        transition-duration: 0.01ms !important;
                    }
                }
            </style>

            <main class="shell">
                <nav class="topbar" aria-label="Navegación del módulo">
                    <div class="brand">
                        <span class="brand-mark" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                <path d="M3 17h18M5 17l2 3h10l2-3M7 14l5-9 5 9M12 5v9"/>
                            </svg>
                        </span>
                        <span>SeaCharter Core PRO</span>
                    </div>
                    <a class="back-link" href="./index.html">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Volver al Core
                    </a>
                </nav>

                <header class="intro">
                    <div>
                        <p class="eyebrow">Módulo satélite · Fase inicial</p>
                        <h1>Modo Dual</h1>
                    </div>
                    <div>
                        <p class="intro-copy">Trading &amp; Chartering en un espacio independiente para preparar el cruce futuro entre margen comercial y coste de fletamento.</p>
                        <div class="isolation-note">Borrador local · Sin sincronización</div>
                    </div>
                </header>

                <section class="workspace" aria-label="Espacio de trabajo Modo Dual">
                    <article class="column trading-column">
                        <span class="section-index">COLUMNA A · 01</span>
                        <h2>Trading</h2>
                        <p class="section-description">Introduce las referencias comerciales de la operación. Estos campos permanecen únicamente dentro de esta vista.</p>

                        <form class="fields" autocomplete="off" onsubmit="return false">
                            <label>
                                Precio FOB · Compra mercancía
                                <span class="input-wrap">
                                    <input data-dual-input name="fobPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="Precio FOB de compra de mercancía">
                                    <span class="unit">USD / TM</span>
                                </span>
                            </label>

                            <label>
                                Precio CIF · Venta mercancía
                                <span class="input-wrap">
                                    <input data-dual-input name="cifPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="Precio CIF de venta de mercancía">
                                    <span class="unit">USD / TM</span>
                                </span>
                            </label>

                            <label>
                                Toneladas totales
                                <span class="input-wrap">
                                    <input data-dual-input name="totalTonnage" type="number" min="0" step="1" inputmode="numeric" placeholder="0" aria-label="Toneladas totales de la operación">
                                    <span class="unit">TM</span>
                                </span>
                            </label>

                            <label>
                                Factor de Estiba
                                <span class="input-wrap">
                                    <input data-dual-input name="stowageFactor" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="Factor de estiba en metros cúbicos por tonelada métrica">
                                    <span class="unit">M³ / TM</span>
                                </span>
                            </label>

                            <label>
                                Tolerancia de Carga · MOLOO / MOLCO
                                <span class="input-wrap">
                                    <input data-dual-input name="cargoTolerance" type="number" min="0" max="100" step="0.1" inputmode="decimal" placeholder="0.0" aria-label="Tolerancia de carga MOLOO o MOLCO en porcentaje">
                                    <span class="unit">%</span>
                                </span>
                            </label>
                        </form>
                    </article>

                    <article class="column chartering-column">
                        <span class="section-index">COLUMNA B · 02</span>
                        <h2>Fletamento</h2>
                        <p class="section-description">Área reservada para recibir el Flete Justo en modo de solo lectura durante una fase posterior.</p>

                        <div class="fields">
                            <div class="placeholder" role="status" aria-live="polite">
                                <div>
                                    <strong>Margen Bruto Comercial</strong>
                                    <p>Precio CIF de venta menos Precio FOB de compra.</p>
                                    <span id="dual-gross-margin" class="read-only-badge">$ 0.00 / TM</span>
                                </div>
                            </div>

                            <div class="placeholder" role="status" aria-live="polite">
                                <div>
                                    <span class="lock" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                            <rect x="5" y="10" width="14" height="10" rx="2"/>
                                            <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
                                        </svg>
                                    </span>
                                    <strong>Flete Justo</strong>
                                    <p>La conexión con la calculadora permanece desactivada. No se leen ni se escriben datos del sistema principal.</p>
                                    <span class="read-only-badge">Integración futura · Solo lectura</span>
                                </div>
                            </div>
                        </div>
                    </article>
                </section>
            </main>
        `;
    }
}

customElements.define('dual-trading-chartering-view', DualTradingCharteringView);
