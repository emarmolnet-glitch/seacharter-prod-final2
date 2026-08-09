const DECISION_SUPPORT_TEMPLATE = String.raw`
            <div class="w-full px-4 md:px-8 space-y-6">

                <!-- CABECERA CON RESUMEN DEL VIAJE Y CONTROL DE ESTADO -->
                <header class="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 shadow-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
                    <div class="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
                        <span class="text-xs text-slate-400 font-mono shrink-0">Audit Engine</span>
                        <h1 class="text-base font-bold tracking-tight text-slate-800 flex items-center gap-2 shrink-0 bg-transparent">
                            <span>Sistema de Soporte de Decisiones (DSS)</span>
                        </h1>
                        <span class="hidden md:inline text-slate-600">|</span>
                        <p id="voyage-summary-subtitle" class="text-xs md:text-sm text-slate-300 font-medium">
                            POL: <span id="summary-pol" class="text-indigo-400 font-bold">—</span> ➔
                            POD: <span id="summary-pod" class="text-indigo-400 font-bold">—</span> |
                            <span id="summary-qty" class="text-emerald-400 font-bold">0 MT</span> ·
                            <span id="summary-commodity" class="text-slate-200">Esperando datos de ruta</span>
                        </p>
                    </div>

                    <!-- Botones de Acción / Simulación y Volver -->
                    <div class="flex flex-wrap items-center gap-2 shrink-0">
                        <button type="button" id="btn-tab-actual" onclick="cargarEscenario('actual')" class="px-3 py-1.5 text-xs font-medium bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/60 border border-indigo-700/50 rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
                            🔵 Situación Actual
                        </button>
                        <button type="button" id="btn-tab-riesgo" onclick="cargarEscenario('riesgo')" class="px-3 py-1.5 text-xs font-medium bg-red-900/40 text-red-300 hover:bg-red-900/60 border border-red-700/50 rounded-lg transition-all flex items-center gap-1.5">
                            🔴 Escenario Riesgo
                        </button>
                        <button type="button" id="btn-tab-alerta" onclick="cargarEscenario('equilibrado')" class="px-3 py-1.5 text-xs font-medium bg-amber-900/40 text-amber-300 hover:bg-amber-900/60 border border-amber-700/50 rounded-lg transition-all flex items-center gap-1.5">
                            🟡 Escenario Alerta
                        </button>
                        <button type="button" id="btn-tab-optimo" onclick="cargarEscenario('optimo')" class="px-3 py-1.5 text-xs font-medium bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60 border border-emerald-700/50 rounded-lg transition-all flex items-center gap-1.5">
                            🟢 Escenario Óptimo
                        </button>
                        <button type="button" id="btn-toggle-parametros" onclick="toggleParametros()" class="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 rounded-lg transition-all flex items-center gap-1">
                            ⚙️ Ajustar Variables <i id="icon-toggle-parametros" class="fa-solid fa-chevron-down text-[10px] ml-1 transition-transform duration-300"></i>
                        </button>
                        <button type="button" id="btn-generate-audit-pdf" onclick="generateAuditPDF()" class="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer">
                            <i class="fa-solid fa-file-pdf text-red-600"></i>
                            <span>Generar Auditoría (PDF)</span>
                        </button>
                        <button type="button" id="btn-generate-fixture-recap-pdf" onclick="generateFixtureRecapPDF()" class="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer">
                            <i class="fa-solid fa-file-contract text-indigo-600"></i>
                            <span>Generar Oferta (Fixture Recap)</span>
                        </button>
                        <button type="button" id="btn-fijar-condiciones-top" onclick="fijarCondicionesDefinitivas()" class="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer">
                            <i class="fa-solid fa-lock"></i>
                            <span>Fijar Condiciones Definitivas</span>
                        </button>
                        <button type="button" onclick="switchTab('estimator')" class="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all flex items-center gap-1">
                            <i class="fa-solid fa-calculator mr-1"></i> Volver a Calculadora
                        </button>
                    </div>
                </header>

                <div id="dss-empty-state" class="rounded-xl border border-dashed border-slate-600 bg-slate-800/70 px-5 py-10 text-center text-sm" style="color: white !important;"></div>

                <!-- PANEL INTERACTIVO DE SIMULACIÓN DE PARÁMETROS (DESPLEGABLE / ACORDEONES) -->
                <section id="panel-parametros" class="hidden bg-white border border-slate-200 rounded-2xl p-5 shadow-xl transition-all text-slate-800 duration-300 ease-in-out overflow-hidden">
                    <!-- HEADER GENERAL CON BOTÓN TOGGLE / CHEVRON -->
                    <div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-4 cursor-pointer select-none" onclick="toggleParametros()">
                        <h2 class="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                            <span>🎛️ Modificar Variables del Viaje y Calculadora de Fletes</span>
                        </h2>
                        <button type="button" aria-label="Toggle Panel Inputs" class="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors flex items-center gap-1 text-xs font-semibold">
                            <span class="hidden sm:inline">Desplegar / Plegar</span>
                            <i id="icon-toggle-panel-main" class="fa-solid fa-chevron-down text-xs transition-transform duration-300"></i>
                        </button>
                    </div>

                    <div class="space-y-4">
                        <!-- ACORDEÓN 1: VARIABLES DEL VIAJE -->
                        <div id="accordion-section-variables" class="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 shadow-sm">
                            <button type="button" id="btn-toggle-variables" onclick="toggleAccordion('variables')" class="w-full flex items-center justify-between px-4 py-3 bg-slate-100/90 hover:bg-slate-200/80 font-semibold text-xs text-slate-700 transition-colors select-none">
                                <span class="flex items-center gap-2">
                                    <i class="fa-solid fa-sliders text-indigo-600"></i>
                                    <span>Variables del Viaje (Ruta, Carga, Laycan y Ritmos)</span>
                                    <span id="badge-variables-status" class="ml-2 text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">🔒 Solo Lectura (Situación Actual)</span>
                                </span>
                                <i id="icon-accordion-variables" class="fa-solid fa-chevron-up text-xs text-slate-500 transition-transform duration-300"></i>
                            </button>
                            <div id="body-accordion-variables" class="p-4 transition-all duration-300 ease-in-out">
                                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Puerto Origen (POL)</label>
                                        <input type="text" id="input-pol" value="" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Puerto Destino (POD)</label>
                                        <input type="text" id="input-pod" value="" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Cantidad Carga (MT)</label>
                                        <input type="number" id="input-cargoQty" value="0" min="0" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Mercancía / Commodity</label>
                                        <input type="text" id="input-commodity" value="Siderúrgico / Carga General" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Días Restantes Laycan</label>
                                        <input type="number" id="input-laycanDaysLeft" value="10" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Días Est. Navegación</label>
                                        <input type="number" id="input-estimatedVoyageDays" value="8" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Ritmo Carga (MT/día)</label>
                                        <input type="number" id="input-loadRate" value="5000" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Ritmo Descarga (MT/día)</label>
                                        <input type="number" id="input-dischargeRate" value="5000" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Días en Puerto (Port Days)</label>
                                        <input type="number" id="input-portDays" value="10" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Días Navegando (Sea Days)</label>
                                        <input type="number" id="input-seaDays" value="8" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ACORDEÓN 2: CALCULADORA DE FLETES -->
                        <div id="accordion-section-fletes" class="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 shadow-sm">
                            <button type="button" id="btn-toggle-fletes" onclick="toggleAccordion('fletes')" class="w-full flex items-center justify-between px-4 py-3 bg-slate-100/90 hover:bg-slate-200/80 font-semibold text-xs text-slate-700 transition-colors select-none">
                                <span class="flex items-center gap-2">
                                    <i class="fa-solid fa-calculator text-emerald-600"></i>
                                    <span>Calculadora de Fletes</span>
                                </span>
                                <i id="icon-accordion-fletes" class="fa-solid fa-chevron-up text-xs text-slate-500 transition-transform duration-300"></i>
                            </button>
                            <div id="body-accordion-fletes" class="p-4 transition-all duration-300 ease-in-out">
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Flete Unitario ($/MT)</label>
                                        <input type="number" id="input-fleteEstimado" value="35" step="any" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1">Break-Even Unitario ($/MT)</label>
                                        <input type="number" id="input-breakEven" value="25" step="any" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ACORDEÓN 3: PRIMAS DE RIESGO & REPOSICIONAMIENTO -->
                        <div id="accordion-section-riesgo-reposicionamiento" class="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 shadow-sm">
                            <button type="button" id="btn-toggle-riesgo" onclick="toggleAccordion('riesgo-reposicionamiento')" class="w-full flex items-center justify-between px-4 py-3 bg-slate-100/90 hover:bg-slate-200/80 font-semibold text-xs text-slate-700 transition-colors select-none">
                                <span class="flex items-center gap-2">
                                    <i class="fa-solid fa-shield-halved text-amber-600"></i>
                                    <span>Primas de Riesgo & Reposicionamiento</span>
                                </span>
                                <i id="icon-accordion-riesgo-reposicionamiento" class="fa-solid fa-chevron-up text-xs text-slate-500 transition-transform duration-300"></i>
                            </button>
                            <div id="body-accordion-riesgo-reposicionamiento" class="p-4 transition-all duration-300 ease-in-out">
                                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                                    <!-- BANNER DE ALERTA DE DÉFICIT DE EXPORTACIÓN EN POD -->
                                    <div id="pod-export-deficit-alert" class="hidden sm:col-span-3 bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-900 flex items-start gap-2.5 shadow-sm transition-all duration-200">
                                        <i class="fa-solid fa-triangle-exclamation text-amber-600 text-base mt-0.5 flex-shrink-0"></i>
                                        <div class="text-xs leading-relaxed font-medium">
                                            Atención: Este puerto suele presentar déficit de carga de exportación para buques de carga general. Considera incrementar los Días de Lastre, ya que el armador cotizará el reposicionamiento.
                                        </div>
                                    </div>
                                    <div class="sm:col-span-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
                                        <div class="flex items-center gap-2 font-semibold text-slate-800 select-none text-xs">
                                            <input type="checkbox" id="input-jwlaRiskActive" class="hidden" disabled>
                                            <i class="fa-solid fa-shield-halved text-amber-600"></i>
                                            <span>Ruta JWC (Joint War Committee):</span>
                                            <span id="badge-jwc-auto-status" class="px-2.5 py-1 text-xs font-bold rounded-lg border bg-slate-200 text-slate-600 border-slate-300">
                                                NORMAL (Sin Recargo Geopolítico)
                                            </span>
                                        </div>
                                        <div id="container-jwlaPremiumUSD" class="flex items-center gap-2">
                                            <label for="input-jwlaPremiumUSD" class="text-slate-600 font-medium text-xs">Prima JWLA ($):</label>
                                            <input type="number" id="input-jwlaPremiumUSD" value="0" step="100" min="0" oninput="actualizarDesdeFormulario()" class="w-32 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold text-xs focus:outline-none focus:border-amber-500">
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1 flex items-center justify-between" for="input-ballastDays">
                                            <span>Días de Lastre (Reposicionamiento)</span>
                                            <span class="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded flex items-center gap-1" title="Campo autocalculado por Matriz de Distancias DSS">
                                                <i class="fa-solid fa-robot text-indigo-500"></i> AUTO
                                            </span>
                                        </label>
                                        <input type="number" id="input-ballastDays" value="0" step="0.1" min="0" readonly class="w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 font-extrabold focus:outline-none cursor-not-allowed" title="Autocalculado por Matriz de Distancias DSS (Read-Only)">
                                    </div>
                                    <div>
                                        <label class="block text-slate-600 font-semibold mb-1" for="input-actualCargoIntake">Ajuste de Calado (Short Lift MT)</label>
                                        <input type="number" id="input-actualCargoIntake" value="0" step="100" min="0" oninput="actualizarDesdeFormulario()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- PANEL DESTACADO: FLETE ORIENTATIVO ALL-IN (FLOOR RATE) GROSS -->
                        <div id="section-flete-all-in-gross" class="mt-4 p-4 bg-slate-900 text-slate-100 border border-emerald-500/40 rounded-xl shadow-lg transition-all duration-200">
                            <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 font-extrabold text-xs rounded-lg border border-emerald-500/30 flex items-center gap-1.5">
                                        <i class="fa-solid fa-chart-line text-emerald-400"></i>
                                        <span>DSS ALL-IN RATE ENGINE</span>
                                    </span>
                                    <h3 class="text-sm font-bold text-white">Flete Orientativo ALL-IN (Floor Rate) Gross</h3>
                                </div>
                                <div class="flex items-center gap-2">
                                    <div id="badge-jwc-risk" class="hidden px-2.5 py-1 bg-amber-500/20 text-amber-300 font-bold text-xs rounded-lg border border-amber-500/40 flex items-center gap-1">
                                        <i class="fa-solid fa-shield-halved text-amber-400"></i>
                                        <span>Zona JWC (Riesgo Geopolítico)</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs mb-3">
                                <div class="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                                    <span class="text-slate-400 block text-[11px]">Flete Neto Base ($/MT)</span>
                                    <strong id="display-net-freight" class="text-slate-200 font-extrabold text-sm">$0.00</strong>
                                </div>
                                <div class="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                                    <span class="text-slate-400 block text-[11px]">Recargo JWC / Lastre ($)</span>
                                    <strong id="display-surcharges-total" class="text-amber-300 font-extrabold text-sm">$0</strong>
                                </div>
                                <div class="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                                    <span class="text-slate-400 block text-[11px]">Gross-Up Comisiones (%)</span>
                                    <strong id="display-commission-pct" class="text-slate-200 font-extrabold text-sm">5.0%</strong>
                                </div>
                                <div class="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 flex flex-col justify-between">
                                    <span class="text-slate-300 font-bold text-[11px]">FLETE ALL-IN GROSS</span>
                                    <strong id="display-all-in-gross" class="text-emerald-400 font-bold text-xl">$0.00 / MT</strong>
                                </div>
                            </div>

                            <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                                <span class="text-[11px] text-slate-400 font-medium">
                                    Cálculo aislado en DSS modo solo-lectura (no muta calculadoras base).
                                </span>
                                <button type="button" id="btn-aplicar-condiciones-recap" onclick="aplicarCondicionesAlRecap()" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer">
                                    <i class="fa-solid fa-file-contract"></i>
                                    <span>Aplicar Condiciones al Recap</span>
                                </button>
                            </div>
                        </div>

                        <!-- ACCIÓN PRINCIPAL DE FIJACIÓN DE CONDICIONES DEFINITIVAS -->
                        <div class="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                            <div class="text-xs text-slate-600 font-medium flex items-center gap-1.5">
                                <i class="fa-solid fa-circle-info text-indigo-500"></i>
                                <span>Consolida los datos simulados hacia la Calculadora y autocompleta la proforma en el Editor.</span>
                            </div>
                            <button type="button" id="btn-fijar-condiciones" onclick="fijarCondicionesDefinitivas()" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer">
                                <i class="fa-solid fa-lock"></i>
                                <span>Fijar Condiciones Definitivas</span>
                            </button>
                        </div>
                    </div>
                </section>

                <!-- GRID DE 3 COLUMNAS PARA SEMÁFOROS (RIESGO CRÍTICO, ADVERTENCIA, SEGURO) -->
                <section class="grid grid-cols-1 md:grid-cols-3 gap-6">

                    <!-- TARJETA 1: RIESGO DE LAYCAN -->
                    <div id="card-laycan" class="bg-slate-800 border border-slate-700 border-l-4 border-l-red-500 rounded-xl p-5 shadow-lg flex flex-col justify-between space-y-4">
                        <div>
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                                    🔴 Riesgo de Laycan
                                </span>
                                <span id="badge-laycan-status" class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-950 text-red-300 border border-red-800">
                                    ALERTA CRÍTICA
                                </span>
                            </div>
                            <h3 id="laycan-title" class="text-lg font-bold text-white mb-2">
                                Margen de Laycan Peligroso
                            </h3>
                            <p id="laycan-desc" class="text-sm text-slate-300 leading-relaxed">
                                Evaluando margen operativo...
                            </p>
                        </div>
                        <div class="pt-3 border-t border-slate-700/60 text-xs text-slate-400 space-y-1.5">
                            <div class="flex justify-between">
                                <span>ETA POL (Est. Llegada):</span>
                                <span id="val-laycan-eta" class="font-bold text-slate-200">--</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Cancelling Date (Límite):</span>
                                <span id="val-laycan-cancelling" class="font-bold text-slate-200">--</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Laycan Días Restantes:</span>
                                <span id="val-laycan-left" class="font-bold text-slate-200">--</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Días Est. Navegación:</span>
                                <span id="val-laycan-voyage" class="font-bold text-slate-200">--</span>
                            </div>
                            <div class="flex justify-between font-semibold pt-1 border-t border-slate-700/40">
                                <span>Buffer de Seguridad (Margen Neto):</span>
                                <span id="val-laycan-buffer" class="text-red-400">--</span>
                            </div>
                        </div>
                    </div>

                    <!-- TARJETA 2: OPERACIONES DE PUERTO (POL / POD) -->
                    <div id="card-loadrate" class="bg-slate-800 border border-slate-700 border-l-4 border-l-amber-500 rounded-xl p-5 shadow-lg flex flex-col justify-between space-y-4">
                        <div>
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                    🟡 Operaciones de Puerto
                                </span>
                                <span id="badge-loadrate-status" class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-950 text-amber-300 border border-amber-800">
                                    ADVERTENCIA
                                </span>
                            </div>
                            <h3 id="loadrate-title" class="text-lg font-bold text-white mb-2">
                                Ritmo de Operación
                            </h3>
                            <p id="loadrate-desc" class="text-sm text-slate-300 leading-relaxed">
                                Evaluando velocidad de carga y descarga...
                            </p>
                        </div>
                        
                        <div class="pt-3 border-t border-slate-700/60 text-xs text-slate-400 space-y-2.5">
                            <!-- Bloque POL -->
                            <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 space-y-1">
                                <div class="text-[11px] font-bold text-indigo-300 uppercase tracking-wide mb-1">Puerto Carga (POL)</div>
                                <div class="flex justify-between">
                                    <span>Ritmo Carga Actual:</span>
                                    <span id="val-loadrate-current" class="font-bold text-slate-200">--</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Días Teóricos Carga:</span>
                                    <span id="val-loadrate-days" class="font-bold text-amber-400">--</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Load Rate Requerido:</span>
                                    <span id="val-loadrate-required" class="font-bold text-emerald-400">--</span>
                                </div>
                            </div>

                            <!-- Bloque POD -->
                            <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 space-y-1">
                                <div class="text-[11px] font-bold text-indigo-300 uppercase tracking-wide mb-1">Puerto Descarga (POD)</div>
                                <div class="flex justify-between">
                                    <span>Ritmo Descarga Actual:</span>
                                    <span id="val-dischargerate-current" class="font-bold text-slate-200">--</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Días Teóricos Descarga:</span>
                                    <span id="val-dischargerate-days" class="font-bold text-amber-400">--</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Discharge Rate Requerido:</span>
                                    <span id="val-dischargerate-required" class="font-bold text-emerald-400">--</span>
                                </div>
                            </div>

                            <!-- Totalizador -->
                            <div class="flex justify-between font-bold text-slate-200 pt-1 border-t border-slate-700/60">
                                <span>Total Días en Puertos (Port Days):</span>
                                <span id="val-portdays-total" class="text-indigo-400">--</span>
                            </div>
                        </div>
                    </div>

                    <!-- TARJETA 3: SALUD FINANCIERA (DESGLOSE UNITARIO) -->
                    <div id="card-financial" class="bg-slate-800 border border-slate-700 border-l-4 border-l-emerald-500 rounded-xl p-5 shadow-lg flex flex-col justify-between space-y-4">
                        <div>
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                    🟢 Salud Financiera
                                </span>
                                <span id="badge-financial-status" class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                    APROBADO
                                </span>
                            </div>
                            <h3 id="financial-title" class="text-lg font-bold text-white mb-2">
                                Rentabilidad Aprobada
                            </h3>
                            <p id="financial-desc" class="text-sm text-slate-300 leading-relaxed">
                                Evaluando margen de beneficio...
                            </p>
                        </div>
                        <div class="pt-3 border-t border-slate-700/60 text-xs text-slate-400 space-y-1.5">
                            <div class="flex justify-between">
                                <span>Flete Estimado Total:</span>
                                <span id="val-financial-flete" class="transition-all duration-300 font-bold text-slate-200">--</span>
                            </div>
                            <div class="flex justify-between font-semibold text-indigo-300">
                                <span>Flete Unitario:</span>
                                <span id="val-financial-flete-unit" class="transition-all duration-300 font-bold text-indigo-300">--</span>
                            </div>
                            <div class="flex justify-between pt-1 border-t border-slate-700/40">
                                <span>Break-Even Total:</span>
                                <span id="val-financial-breakeven" class="font-bold text-slate-200">--</span>
                            </div>
                            <div class="flex justify-between font-semibold text-amber-300">
                                <span>Break-Even Unitario:</span>
                                <span id="val-financial-breakeven-unit" class="font-bold text-amber-300">--</span>
                            </div>
                            <div class="flex justify-between font-bold pt-1 border-t border-slate-700/60">
                                <span>Margen Bruto Calculado:</span>
                                <span id="val-financial-margin" class="text-emerald-400">--</span>
                            </div>
                        </div>
                    </div>

                </section>

                <!-- SECCIÓN: MOTOR DE RECOMENDACIONES COMERCIALES Y RIESGOS OPERATIVOS -->
                <section class="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
                    <div class="flex items-center justify-between border-b border-slate-700 pb-4">
                        <div>
                            <h2 class="text-xl font-bold text-white flex items-center gap-2">
                                <span>🎯 Motor de Recomendaciones Comerciales</span>
                            </h2>
                            <p class="text-xs text-slate-400">
                                Estrategias quirúrgicas de negociación Armador ↔ Fletador generadas automáticamente en tiempo real.
                            </p>
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-indigo-400 border border-indigo-500/30">
                            DSS Algorithmic Directives
                        </span>
                    </div>

                    <div id="contenedor-recomendaciones" class="space-y-3">
                        <!-- Se inyectan dinámicamente -->
                    </div>
                </section>

                <!-- BARRA DE PROGRESO VISUAL: RATIO DE TIEMPO (PUERTO VS NAVEGACIÓN) -->
                <section class="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700 pb-4">
                        <div>
                            <h2 class="text-lg font-bold text-white flex items-center gap-2">
                                <span>⏱️ Distribución de Tiempo Operativo (Puerto vs Navegación)</span>
                            </h2>
                            <p class="text-xs text-slate-400">
                                Análisis visual de exposición a puerto (Port Days) frente a días efectivos de mar (Sea Days).
                            </p>
                        </div>
                        <div class="flex items-center gap-4 text-xs font-semibold">
                            <div class="flex items-center gap-1.5">
                                <span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                                <span class="text-slate-300">Días en Puerto: <span id="label-port-days-count" class="text-amber-400">0</span> d (<span id="label-port-pct" class="text-amber-400">0%</span>)</span>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <span class="w-3 h-3 rounded-full bg-indigo-500 inline-block"></span>
                                <span class="text-slate-300">Días Navegando: <span id="label-sea-days-count" class="text-indigo-400">0</span> d (<span id="label-sea-pct" class="text-indigo-400">0%</span>)</span>
                            </div>
                        </div>
                    </div>

                    <!-- Contenedor de la barra de progreso dual -->
                    <div class="space-y-2">
                        <div class="w-full bg-slate-900 h-6 rounded-full overflow-hidden flex border border-slate-700 shadow-inner">
                            <div id="bar-port" class="bg-amber-500 h-full text-[11px] font-extrabold text-slate-950 flex items-center justify-center transition-all duration-500" style="width: 50%;">
                                50% Puerto
                            </div>
                            <div id="bar-sea" class="bg-indigo-600 h-full text-[11px] font-extrabold text-white flex items-center justify-center transition-all duration-500" style="width: 50%;">
                                50% Mar
                            </div>
                        </div>

                        <!-- Leyenda e Interpretación de Diagnóstico de Tiempo -->
                        <div id="diagnostico-tiempo" class="text-xs text-slate-400 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50 flex items-center justify-between">
                            <span>Cargando análisis de ratio de tiempo...</span>
                        </div>
                    </div>
                </section>

            </div>
`;

const DSS_EMPTY_STATE_TEMPLATE = `
    <strong class="block text-base text-white font-semibold" style="color: #ffffff !important;">
        Esperando datos de ruta
    </strong>
    <span class="mt-2 block text-gray-300" style="color: #d1d5db !important;">
        Define POL, POD y cantidad de carga en Mapa o Calculadora para activar Decisiones.
    </span>
`;

function renderDecisionSupportEmptyState() {
    const emptyState = document.getElementById("dss-empty-state");
    if (emptyState) emptyState.innerHTML = DSS_EMPTY_STATE_TEMPLATE;
}

function hydrateDecisionSupportState() {
    window.requestAnimationFrame(() => {
        if (typeof window.syncDecisionesFromCalculator === "function") {
            window.syncDecisionesFromCalculator();
            return;
        }
        window.actualizarDesdeFormulario?.();
    });
}

export function mountDecisionSupportModule(container) {
    if (!container || container.dataset.dssMounted === "true") return container;

    container.innerHTML = DECISION_SUPPORT_TEMPLATE;
    container.dataset.dssMounted = "true";
    renderDecisionSupportEmptyState();
    hydrateDecisionSupportState();
    return container;
}
