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
                            🟢 Posicionamiento Óptimo
                        </button>
                        <button type="button" id="btn-tab-comparativa" onclick="cargarEscenario('comparativa')" class="px-3 py-1.5 text-xs font-medium bg-cyan-900/40 text-cyan-300 hover:bg-cyan-900/60 border border-cyan-700/50 rounded-lg transition-all flex items-center gap-1.5">
                            ⚖️ Comparativa
                        </button>
                        <button type="button" id="btn-aplicar-valores-optimos-top" onclick="aplicarValoresOptimosAlProyecto()" class="hidden px-3.5 py-1.5 text-xs font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/50 border border-emerald-400/40 cursor-pointer">
                            <i class="fa-solid fa-wand-magic-sparkles text-emerald-200"></i>
                            <span>Aplicar Valores Óptimos al Proyecto</span>
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
                        <button type="button" id="btn-auditoria-madre" onclick="solicitarAuditoriaMadre()" class="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-teal-800 border border-teal-700/30 rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer">
                            <i class="fa-solid fa-shield-halved text-teal-700"></i>
                            <span>Auditoría MADRE</span>
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
                <section id="panel-parametros" class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all text-slate-800 duration-300 ease-in-out overflow-hidden">
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

                <!-- PANEL COMPARATIVO Y DE MONITORIZACIÓN DE ESCENARIOS (SPLIT VIEW / TABLA) -->
                <section id="panel-comparativo-dss" class="space-y-4">
                    <!-- ENCABEZADO DE COMPARATIVA Y ACCIÓN DESTACADA DE APLICACIÓN -->
                    <div id="dss-comparativa-header" class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <span class="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 text-lg">
                                <i class="fa-solid fa-code-compare"></i>
                            </span>
                            <div>
                                <h2 class="text-sm md:text-base font-bold text-slate-800 flex items-center gap-2">
                                    <span>Comparativa de Escenarios: Situación Actual vs Posicionamiento Óptimo</span>
                                    <span id="badge-comparativa-mode" class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        FRENTE A FRENTE
                                    </span>
                                </h2>
                                <p class="text-xs text-slate-500 mt-0.5">
                                    Enfrentamiento simultáneo cara a cara de métricas operativas y propuesta de optimización algorítmica.
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <!-- BOTÓN DESTACADO: APLICAR VALORES ÓPTIMOS AL PROYECTO -->
                            <button type="button" id="btn-aplicar-valores-optimos" onclick="aplicarValoresOptimosAlProyecto()" class="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-sm border border-emerald-500 flex items-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
                                <i class="fa-solid fa-wand-magic-sparkles text-emerald-100"></i>
                                <span>Aplicar Valores Óptimos al Proyecto</span>
                            </button>
                        </div>
                    </div>

                    <!-- TABLA COMPARATIVA CON 3 COLUMNAS: Métrica | Situación Actual | Situación Óptima (TEMA CLARO) -->
                    <div id="dss-tabla-comparativa-container" class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 border-b border-slate-200">
                                    <th scope="col" class="py-3 px-4 font-bold text-slate-700 w-1/3">Métrica</th>
                                    <th scope="col" class="py-3 px-4 font-bold text-indigo-700 w-1/3 bg-indigo-50/60 border-l border-slate-200">
                                        <div class="flex items-center justify-between">
                                            <span class="flex items-center gap-1.5">
                                                <i class="fa-solid fa-circle-dot text-indigo-600 text-[10px]"></i>
                                                <span>Situación Actual</span>
                                            </span>
                                            <span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold">Línea Base</span>
                                        </div>
                                    </th>
                                    <th scope="col" class="py-3 px-4 font-bold text-emerald-700 w-1/3 bg-emerald-50/60 border-l border-slate-200">
                                        <div class="flex items-center justify-between">
                                            <span class="flex items-center gap-1.5">
                                                <i class="fa-solid fa-wand-magic-sparkles text-emerald-600 text-[10px]"></i>
                                                <span>Situación Óptima</span>
                                            </span>
                                            <span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold">Recomendación DSS</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200 text-slate-700">
                                <!-- FILA 1: MARGEN DE LAYCAN (DÍAS) -->
                                <tr class="hover:bg-slate-50/70 transition-colors">
                                    <td class="py-3.5 px-4 font-semibold align-top">
                                        <div class="flex items-center gap-2 text-slate-800 font-bold">
                                            <i class="fa-solid fa-calendar-day text-red-500"></i>
                                            <span>Margen de Laycan (días)</span>
                                        </div>
                                        <div class="text-[10px] text-slate-500 mt-1">
                                            Buffer neto de seguridad entre llegada estimada (ETA) y fecha de cancelación (Cancelling Date).
                                        </div>
                                    </td>
                                    <td class="py-3.5 px-4 bg-indigo-50/20 border-l border-slate-200 align-top" id="col-actual-laycan">
                                        <div class="space-y-1">
                                            <div class="flex items-center justify-between">
                                                <span class="text-slate-500 text-[11px]">Buffer de Seguridad:</span>
                                                <strong id="cmp-actual-buffer" class="font-bold text-amber-700 text-sm">--</strong>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500">
                                                <span>Días Restantes Laycan:</span>
                                                <span id="cmp-actual-laycan-days" class="text-slate-700 font-mono">--</span>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500">
                                                <span>Cancelling Date:</span>
                                                <span id="cmp-actual-cancelling-date" class="text-slate-700 font-mono font-semibold">--</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="py-3.5 px-4 bg-emerald-50/20 border-l border-slate-200 align-top" id="col-optimo-laycan">
                                        <div class="space-y-1">
                                            <div class="flex items-center justify-between">
                                                <span class="text-slate-500 text-[11px]">Buffer de Seguridad:</span>
                                                <div class="flex items-center gap-1.5">
                                                    <strong id="cmp-optimo-buffer" class="font-bold text-emerald-700 text-sm">--</strong>
                                                    <span id="cmp-delta-buffer" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">+0 d</span>
                                                </div>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500">
                                                <span>Días Restantes Laycan:</span>
                                                <span id="cmp-optimo-laycan-days" class="text-emerald-700 font-mono font-semibold">--</span>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500">
                                                <span>Cancelling Date Sugerida:</span>
                                                <span id="cmp-optimo-cancelling-date" class="text-emerald-700 font-mono font-bold">--</span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>

                                <!-- FILA 2: RITMO DE OPERACIONES (MT/DÍA) -->
                                <tr class="hover:bg-slate-50/70 transition-colors">
                                    <td class="py-3.5 px-4 font-semibold align-top">
                                        <div class="flex items-center gap-2 text-slate-800 font-bold">
                                            <i class="fa-solid fa-boxes-packing text-amber-500"></i>
                                            <span>Ritmo de Operaciones (MT/día)</span>
                                        </div>
                                        <div class="text-[10px] text-slate-500 mt-1">
                                            Velocidades de carga en origen (POL) y descarga en destino (POD) y su impacto en días de puerto.
                                        </div>
                                    </td>
                                    <td class="py-3.5 px-4 bg-indigo-50/20 border-l border-slate-200 align-top" id="col-actual-ritmos">
                                        <div class="space-y-1">
                                            <div class="flex items-center justify-between">
                                                <span class="text-slate-500 text-[11px]">Ritmo Carga (POL):</span>
                                                <strong id="cmp-actual-loadrate" class="font-bold text-slate-800 text-xs">-- MT/d</strong>
                                            </div>
                                            <div class="flex items-center justify-between">
                                                <span class="text-slate-500 text-[11px]">Ritmo Descarga (POD):</span>
                                                <strong id="cmp-actual-dischargerate" class="font-bold text-slate-800 text-xs">-- MT/d</strong>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                                                <span>Total Port Days:</span>
                                                <span id="cmp-actual-portdays" class="text-amber-700 font-bold font-mono">-- d</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="py-3.5 px-4 bg-emerald-50/20 border-l border-slate-200 align-top" id="col-optimo-ritmos">
                                        <div class="space-y-1">
                                            <div class="flex items-center justify-between">
                                                <span class="text-slate-500 text-[11px]">Ritmo Carga Optimizado:</span>
                                                <div class="flex items-center gap-1.5">
                                                    <strong id="cmp-optimo-loadrate" class="font-bold text-emerald-700 text-xs">-- MT/d</strong>
                                                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">+30%</span>
                                                </div>
                                            </div>
                                            <div class="flex items-center justify-between">
                                                <span class="text-slate-500 text-[11px]">Ritmo Descarga Optimizado:</span>
                                                <div class="flex items-center gap-1.5">
                                                    <strong id="cmp-optimo-dischargerate" class="font-bold text-emerald-700 text-xs">-- MT/d</strong>
                                                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">+30%</span>
                                                </div>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                                                <span>Total Port Days Reducidos:</span>
                                                <div class="flex items-center gap-1.5">
                                                    <span id="cmp-optimo-portdays" class="text-emerald-700 font-bold font-mono">-- d</span>
                                                    <span id="cmp-delta-portdays" class="text-[10px] font-bold text-emerald-800">(-0 d)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>

                                <!-- FILA 3: RENTABILIDAD (MARGEN BRUTO / BENEFICIO) -->
                                <tr class="hover:bg-slate-50/70 transition-colors">
                                    <td class="py-3.5 px-4 font-semibold align-top">
                                        <div class="flex items-center gap-2 text-slate-800 font-bold">
                                            <i class="fa-solid fa-chart-line text-emerald-600"></i>
                                            <span>Rentabilidad (Margen Bruto / Beneficio)</span>
                                        </div>
                                        <div class="text-[10px] text-slate-500 mt-1">
                                            Margen porcentual sobre flete cotizado, reducción de costes Break-Even y beneficio neto global.
                                        </div>
                                    </td>
                                    <td class="py-3.5 px-4 bg-indigo-50/20 border-l border-slate-200 align-top" id="col-actual-rentabilidad">
                                        <div class="space-y-1">
                                            <div class="flex items-center justify-between">
                                                <span class="text-slate-500 text-[11px]">Margen Bruto (%):</span>
                                                <strong id="cmp-actual-margen" class="font-bold text-indigo-700 text-sm">--%</strong>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500">
                                                <span>Break-Even Unitario:</span>
                                                <span id="cmp-actual-breakeven" class="text-slate-700 font-mono">$0.00 / MT</span>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                                                <span>Beneficio Estimado:</span>
                                                <strong id="cmp-actual-beneficio" class="text-slate-800 font-mono">$0</strong>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="py-3.5 px-4 bg-emerald-50/20 border-l border-slate-200 align-top" id="col-optimo-rentabilidad">
                                        <div class="space-y-1">
                                            <div class="flex items-center justify-between">
                                                <span class="text-slate-500 text-[11px]">Margen Bruto (%):</span>
                                                <div class="flex items-center gap-1.5">
                                                    <strong id="cmp-optimo-margen" class="font-bold text-emerald-700 text-sm">--%</strong>
                                                    <span id="cmp-delta-margen" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">+0%</span>
                                                </div>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500">
                                                <span>Break-Even Unitario Optimizado:</span>
                                                <div class="flex items-center gap-1.5">
                                                    <span id="cmp-optimo-breakeven" class="text-emerald-700 font-mono font-bold">$0.00 / MT</span>
                                                    <span class="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-800">-10%</span>
                                                </div>
                                            </div>
                                            <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                                                <span>Beneficio Estimado Optimizado:</span>
                                                <div class="flex items-center gap-1.5">
                                                    <strong id="cmp-optimo-beneficio" class="text-emerald-700 font-mono font-bold">$0</strong>
                                                    <span id="cmp-delta-beneficio" class="text-[10px] font-bold text-emerald-800">(+$0)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <!-- GRID DE 3 COLUMNAS PARA SEMÁFOROS (OCULTO - SUSTITUIDO POR TABLA COMPARATIVA) -->
                <section class="hidden grid-cols-1 md:grid-cols-3 gap-6" style="display: none !important;" aria-hidden="true">

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

                    <!-- NIVEL 1: TARJETA DE ALERTA RESUMEN AUDITORÍA MADRE -->
                    <div id="tarjeta-resumen-auditoria-madre" class="hidden"></div>

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

                <!-- NIVEL 2: PANEL LATERAL (OFFCANVAS) NATIVO UI - AUDITORÍA MADRE -->
                <div id="madre-offcanvas-backdrop" class="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[9998] hidden transition-opacity" onclick="cerrarAuditoriaMadreOffcanvas()"></div>
                <aside id="madre-offcanvas-panel" class="fixed top-0 right-0 bottom-0 z-[9999] w-full max-w-xl md:max-w-2xl bg-white shadow-2xl border-l border-gray-200 flex flex-col transform translate-x-full transition-transform duration-300 ease-in-out font-sans" aria-label="Auditoría Estratégica MADRE" role="dialog" aria-modal="true">
                    <!-- Offcanvas Header -->
                    <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
                        <div class="flex items-center gap-3">
                            <span class="p-2.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-lg">
                                <i class="fa-solid fa-shield-halved"></i>
                            </span>
                            <div>
                                <h3 class="text-base font-bold text-slate-900">Auditoría Estratégica MADRE</h3>
                                <p class="text-xs text-gray-500">Dictamen Ejecutivo Corporativo & Propuesta de Optimización</p>
                            </div>
                        </div>
                        <button type="button" id="btn-cerrar-auditoria-offcanvas" onclick="cerrarAuditoriaMadreOffcanvas()" class="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" aria-label="Cerrar panel">
                            <i class="fa-solid fa-xmark text-lg"></i>
                        </button>
                    </header>

                    <!-- Offcanvas Scrollable Body -->
                    <div id="madre-offcanvas-body" class="flex-1 overflow-y-auto p-6 space-y-6 text-slate-900 bg-white">
                        <!-- Veredicto Banner -->
                        <div id="madre-offcanvas-veredicto-container" class="p-4 rounded-xl border border-gray-200 bg-slate-50 flex items-center justify-between">
                            <div>
                                <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500">Dictamen General</span>
                                <div id="madre-offcanvas-veredicto-val" class="text-base font-bold text-slate-900 mt-0.5">--</div>
                            </div>
                            <div id="madre-offcanvas-veredicto-badge" class="px-3 py-1 rounded-full text-xs font-bold bg-white border border-gray-200 shadow-sm">
                                --
                            </div>
                        </div>

                        <!-- Reporte Estratégico -->
                        <div class="space-y-2">
                            <h4 class="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                                <i class="fa-solid fa-file-lines"></i>
                                <span>Reporte Estratégico</span>
                            </h4>
                            <div id="madre-offcanvas-reporte" class="text-sm text-gray-800 leading-relaxed bg-white border border-gray-200 rounded-xl p-4 shadow-sm whitespace-pre-line">
                                <!-- Se inyecta reporte_estrategico -->
                            </div>
                        </div>

                        <!-- Variables Perjudiciales -->
                        <div class="space-y-2">
                            <h4 class="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                                <i class="fa-solid fa-triangle-exclamation"></i>
                                <span>Variables Perjudiciales Identificadas</span>
                            </h4>
                            <div id="madre-offcanvas-variables" class="flex flex-wrap gap-2">
                                <!-- Se inyectan badges rojas/naranjas -->
                            </div>
                        </div>

                        <!-- Recomendaciones Estratégicas (Acción, Pro en verde, Contra en rojo) -->
                        <div class="space-y-3">
                            <h4 class="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                                <i class="fa-solid fa-arrows-split-up-and-left"></i>
                                <span>Recomendaciones Estratégicas</span>
                            </h4>
                            <div id="madre-offcanvas-recomendaciones" class="space-y-3">
                                <!-- Se inyectan recomendaciones -->
                            </div>
                        </div>
                    </div>

                    <!-- Offcanvas Footer: Botón Fixture Recap (Opción B) -->
                    <footer class="bg-slate-50 border-t border-gray-200 p-4 shrink-0">
                        <button type="button" id="btn-fixture-recap-opcion-b" onclick="generarFixtureRecapOpcionB()" class="w-full py-3 px-4 bg-teal-800 hover:bg-teal-700 text-white font-bold text-sm rounded-lg shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer">
                            <i class="fa-solid fa-file-contract text-teal-200"></i>
                            <span>Generar Fixture Recap Estratégico (Opción B)</span>
                        </button>
                        <p class="text-[11px] text-gray-500 text-center mt-2">
                            Aplica automáticamente las modificaciones acordadas (flete, cláusulas y laytime) y exporta el Recap PDF oficial.
                        </p>
                    </footer>
                </aside>

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

// Escuchar actualizaciones de ruta y cálculo en tiempo real
if (typeof window !== "undefined") {
    if (!window.__dssVoyageCalculatedListenerInstalled) {
        window.__dssVoyageCalculatedListenerInstalled = true;
        const onVoyageUpdated = (event) => {
            const detail = event?.detail || window.activeVoyage || window.State || {};
            if (typeof window.syncDecisionesFromCalculator === "function") {
                window.syncDecisionesFromCalculator();
            } else if (typeof window.actualizarDesdeFormulario === "function") {
                window.actualizarDesdeFormulario();
            }
        };
        window.addEventListener("voyageCalculated", onVoyageUpdated);
        window.addEventListener("CALCULATION_EVENT", onVoyageUpdated);
        window.addEventListener("AUTO_FLOW_CALCULATIONS_READY", onVoyageUpdated);
    }
}

export function mountDecisionSupportModule(container) {
    if (!container || container.dataset.dssMounted === "true") return container;

    container.innerHTML = DECISION_SUPPORT_TEMPLATE;
    container.dataset.dssMounted = "true";
    renderDecisionSupportEmptyState();
    hydrateDecisionSupportState();
    return container;
}

export function calcularEscenarioOptimoDesdeBase(baseState) {
    if (!baseState) return null;
    const currentLoadRate = Number(baseState.loadRate) || 5000;
    const currentDischargeRate = Number(baseState.dischargeRate) || currentLoadRate || 5000;
    const voyageDays = Number(baseState.estimatedVoyageDays || baseState.seaDays) || 8;
    const baseFleteUnitario = Number(baseState.fleteUnitario || baseState.fleteEstimado || 35);
    const baseBreakEvenUnitario = Number(baseState.breakEvenUnitario || baseState.breakEven || 25);
    const clampRate = (rate) => Math.min(100000, Math.max(1500, Math.round(Number(rate) || 1500)));

    const simLaycanDays = Number((voyageDays + 10).toFixed(1));
    const today = new Date();
    return {
        ...baseState,
        laycanDaysLeft: simLaycanDays,
        cancellingDate: new Date(today.getTime() + Math.max(0, simLaycanDays) * 86400000),
        loadRate: clampRate(currentLoadRate * 1.30),
        dischargeRate: clampRate(currentDischargeRate * 1.30),
        fleteUnitario: baseFleteUnitario,
        fleteEstimado: baseFleteUnitario,
        breakEvenUnitario: Number((baseBreakEvenUnitario * 0.90).toFixed(2)),
        breakEven: Number((baseBreakEvenUnitario * 0.90).toFixed(2))
    };
}

export function renderizarComparativaEscenarios(actualState, optimoState) {
    if (!actualState) return;
    const today = new Date();
    const opt = optimoState || calcularEscenarioOptimoDesdeBase(actualState) || actualState;

    // Fechas y Laycan Actual
    let actualCancelDate = actualState.cancellingDate;
    if (typeof actualCancelDate === 'string' && actualCancelDate.includes('/')) {
        const parts = actualCancelDate.split('/');
        if (parts.length === 3) actualCancelDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } else if (actualCancelDate && !(actualCancelDate instanceof Date)) {
        actualCancelDate = new Date(actualCancelDate);
    }
    if (!actualCancelDate || isNaN(actualCancelDate.getTime())) {
        actualCancelDate = new Date(today.getTime() + Math.max(0, Number(actualState.laycanDaysLeft) || 10) * 86400000);
    }

    const voyageDays = Number(actualState.estimatedVoyageDays || actualState.seaDays) || 8;
    const etaDate = new Date(today.getTime() + Math.max(0, voyageDays) * 86400000);

    const calcDays = (d1, d2) => {
        if (typeof window !== 'undefined' && typeof window.differenceInDays === 'function') {
            return window.differenceInDays(d1, d2);
        }
        return Math.round((d1.getTime() - d2.getTime()) / 86400000);
    };

    const actualBuffer = calcDays(actualCancelDate, etaDate);
    const actualLaycanDays = calcDays(actualCancelDate, today);

    // Fechas y Laycan Óptimo
    let optCancelDate = opt.cancellingDate;
    if (typeof optCancelDate === 'string' && optCancelDate.includes('/')) {
        const parts = optCancelDate.split('/');
        if (parts.length === 3) optCancelDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } else if (optCancelDate && !(optCancelDate instanceof Date)) {
        optCancelDate = new Date(optCancelDate);
    }
    if (!optCancelDate || isNaN(optCancelDate.getTime())) {
        optCancelDate = new Date(today.getTime() + Math.max(0, Number(opt.laycanDaysLeft) || 18) * 86400000);
    }

    const optBuffer = calcDays(optCancelDate, etaDate);
    const optLaycanDays = calcDays(optCancelDate, today);

    // Ritmos y Operaciones
    const actualLoad = Math.max(1, Number(actualState.loadRate) || 5000);
    const actualDisch = Math.max(1, Number(actualState.dischargeRate) || actualLoad);
    const optLoad = Math.max(1, Number(opt.loadRate) || Math.round(actualLoad * 1.30));
    const optDisch = Math.max(1, Number(opt.dischargeRate) || Math.round(actualDisch * 1.30));

    const cargoQty = Math.max(1, Number(actualState.cargoQty) || 1);
    const actualPortDays = (cargoQty / actualLoad) + (cargoQty / actualDisch);
    const optPortDays = (cargoQty / optLoad) + (cargoQty / optDisch);

    // Rentabilidad
    const fleteUnit = Number(actualState.fleteUnitario || actualState.fleteEstimado || 35);
    const actualBreakEven = Number(actualState.breakEvenUnitario || actualState.breakEven || 25);
    const optBreakEven = Number(opt.breakEvenUnitario || opt.breakEven || (actualBreakEven * 0.90));

    const actualMargen = fleteUnit > 0 ? ((fleteUnit - actualBreakEven) / fleteUnit) * 100 : 0;
    const optMargen = fleteUnit > 0 ? ((fleteUnit - optBreakEven) / fleteUnit) * 100 : 0;

    const actualBeneficio = (fleteUnit - actualBreakEven) * cargoQty;
    const optBeneficio = (fleteUnit - optBreakEven) * cargoQty;

    const setText = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
    };

    const formatDateStr = (d) => {
        if (!d || isNaN(d.getTime())) return '--';
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    // Inyectar en DOM
    setText('cmp-actual-buffer', `${actualBuffer.toFixed(1)} días`);
    setText('cmp-actual-laycan-days', `${actualLaycanDays.toFixed(1)} días`);
    setText('cmp-actual-cancelling-date', formatDateStr(actualCancelDate));

    setText('cmp-optimo-buffer', `${optBuffer.toFixed(1)} días`);
    setText('cmp-delta-buffer', `+${Math.max(0, optBuffer - actualBuffer).toFixed(1)} d`);
    setText('cmp-optimo-laycan-days', `${optLaycanDays.toFixed(1)} días`);
    setText('cmp-optimo-cancelling-date', formatDateStr(optCancelDate));

    setText('cmp-actual-loadrate', `${Number(actualLoad).toLocaleString('es-ES')} MT/d`);
    setText('cmp-actual-dischargerate', `${Number(actualDisch).toLocaleString('es-ES')} MT/d`);
    setText('cmp-actual-portdays', `${actualPortDays.toFixed(1)} d`);

    setText('cmp-optimo-loadrate', `${Number(optLoad).toLocaleString('es-ES')} MT/d`);
    setText('cmp-optimo-dischargerate', `${Number(optDisch).toLocaleString('es-ES')} MT/d`);
    setText('cmp-optimo-portdays', `${optPortDays.toFixed(1)} d`);
    const portDaysDiff = actualPortDays - optPortDays;
    setText('cmp-delta-portdays', `(-${Math.max(0, portDaysDiff).toFixed(1)} d)`);

    setText('cmp-actual-margen', `${actualMargen.toFixed(1)}%`);
    setText('cmp-actual-breakeven', `$${actualBreakEven.toFixed(2)} / MT`);
    setText('cmp-actual-beneficio', `$${Math.round(actualBeneficio).toLocaleString('en-US')}`);

    setText('cmp-optimo-margen', `${optMargen.toFixed(1)}%`);
    setText('cmp-delta-margen', `+${Math.max(0, optMargen - actualMargen).toFixed(1)}%`);
    setText('cmp-optimo-breakeven', `$${optBreakEven.toFixed(2)} / MT`);
    setText('cmp-optimo-beneficio', `$${Math.round(optBeneficio).toLocaleString('en-US')}`);
    const beneficioDiff = optBeneficio - actualBeneficio;
    setText('cmp-delta-beneficio', `(+$${Math.round(Math.max(0, beneficioDiff)).toLocaleString('en-US')})`);
}

export function aplicarValoresOptimosAlProyecto() {
    try {
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            window.showToast('Aplicando valores óptimos al proyecto...', true);
        }

        const base = (typeof window !== 'undefined' && typeof window.getDSSCurrentState === 'function')
            ? window.getDSSCurrentState()
            : ((typeof window !== 'undefined' && (window.dssBaseActualState || window.dssFormState)) || {});

        const currentLoad = Number(base.loadRate) || 5000;
        const currentDisch = Number(base.dischargeRate) || currentLoad || 5000;
        const voyageDays = Number(base.estimatedVoyageDays || base.seaDays) || 8;
        const clampRate = (rate) => Math.min(100000, Math.max(1500, Math.round(Number(rate) || 1500)));

        const simLaycanDays = Number((voyageDays + 10).toFixed(1));
        const today = new Date();
        const activeSim = (typeof window !== 'undefined' && window.dssSimulationState) ? window.dssSimulationState : null;

        const optimalCancellingDate = (activeSim && activeSim.cancellingDate)
            ? (activeSim.cancellingDate instanceof Date ? activeSim.cancellingDate : new Date(activeSim.cancellingDate))
            : new Date(today.getTime() + Math.max(0, simLaycanDays) * 86400000);

        const optimalLoadRate = (activeSim && activeSim.loadRate)
            ? Number(activeSim.loadRate)
            : clampRate(currentLoad * 1.30);
        const optimalDischargeRate = (activeSim && activeSim.dischargeRate)
            ? Number(activeSim.dischargeRate)
            : clampRate(currentDisch * 1.30);
        const optimalLaycanDays = (activeSim && activeSim.laycanDaysLeft)
            ? Number(activeSim.laycanDaysLeft)
            : simLaycanDays;

        const formatIsoDate = (d) => {
            if (!d) return '';
            const dateObj = d instanceof Date ? d : new Date(d);
            if (isNaN(dateObj.getTime())) return '';
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const isoDate = formatIsoDate(optimalCancellingDate);
        const visualDate = optimalCancellingDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // 1. Actualizar State global
        if (typeof window !== 'undefined' && window.State) {
            window.State.loadRate = optimalLoadRate;
            window.State.dischRate = optimalDischargeRate;
            if (isoDate) {
                window.State.cancellingDate = isoDate;
                window.State.laycanEnd = isoDate;
            }
            window.State.laycanDaysLeft = optimalLaycanDays;
        }

        // 2. Actualizar SeaCharterStore
        if (typeof window !== 'undefined' && window.SeaCharterStore && window.SeaCharterStore.set) {
            window.SeaCharterStore.set({
                loadRate: optimalLoadRate,
                dischRate: optimalDischargeRate,
                cancellingDate: isoDate || (window.State ? window.State.cancellingDate : ''),
                laycanDaysLeft: optimalLaycanDays
            });
        }

        // 3. Persistencia en LocalStorage
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('calculator_rate_load', String(optimalLoadRate));
            localStorage.setItem('calculator_rate_disch', String(optimalDischargeRate));
            localStorage.setItem('calculator_load_rate', String(optimalLoadRate));
            localStorage.setItem('calculator_discharge_rate', String(optimalDischargeRate));
            if (isoDate) {
                localStorage.setItem('calculator_cancelling_date', isoDate);
                localStorage.setItem('calculator_laycan', isoDate);
            }
            localStorage.setItem('dss_optimal_applied', JSON.stringify({
                loadRate: optimalLoadRate,
                dischargeRate: optimalDischargeRate,
                cancellingDate: isoDate,
                laycanDaysLeft: optimalLaycanDays,
                appliedAt: new Date().toISOString()
            }));
        }

        // 4. Sincronizar inputs en el DOM
        const setValSafe = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };

        setValSafe('rate-load', optimalLoadRate);
        setValSafe('rate-disch', optimalDischargeRate);
        setValSafe('input-loadRate', optimalLoadRate);
        setValSafe('input-dischargeRate', optimalDischargeRate);
        setValSafe('gc-laytime-load-val', optimalLoadRate);
        setValSafe('gc-laytime-disch-val', optimalDischargeRate);

        if (isoDate) {
            setValSafe('gc-cancel-date', isoDate);
            setValSafe('asb-cancel-date', isoDate);
            setValSafe('map-cancelling-date', isoDate);
        }
        setValSafe('input-laycanDaysLeft', optimalLaycanDays);

        // 5. Recalcular calculadora y sincronizar
        if (typeof window !== 'undefined') {
            if (typeof window.recalcularDiasPuerto === 'function') window.recalcularDiasPuerto();
            if (typeof window.syncGlobalStateToForms === 'function') window.syncGlobalStateToForms();
            if (typeof window.runEngine === 'function') window.runEngine();

            if (typeof window.limpiarDssSimulationState === 'function') {
                window.limpiarDssSimulationState();
            }

            const updatedBase = {
                ...base,
                loadRate: optimalLoadRate,
                dischargeRate: optimalDischargeRate,
                cancellingDate: optimalCancellingDate,
                laycanDaysLeft: optimalLaycanDays
            };
            window.dssFormState = { ...updatedBase };
            window.dssBaseActualState = { ...updatedBase };

            if (typeof window.sincronizarFormularioDesdeEstado === 'function') {
                window.sincronizarFormularioDesdeEstado(window.dssFormState);
            }
            if (typeof window.generarAuditoriaOperativa === 'function') {
                window.generarAuditoriaOperativa(window.dssFormState);
            }
            if (typeof window.actualizarEstiloBotonesEscenario === 'function') {
                window.actualizarEstiloBotonesEscenario('actual');
            }

            window.dispatchEvent(new CustomEvent('voyageCalculated', { detail: window.State }));
            window.dispatchEvent(new CustomEvent('core-pro:optimal-applied', {
                detail: {
                    loadRate: optimalLoadRate,
                    dischargeRate: optimalDischargeRate,
                    cancellingDate: isoDate,
                    laycanDaysLeft: optimalLaycanDays
                }
            }));

            if (typeof window.showToast === 'function') {
                window.showToast(`✅ Valores óptimos aplicados al proyecto (Ritmo: ${optimalLoadRate.toLocaleString()} MT/d, Cancelling: ${visualDate})`);
            }
        }
    } catch (err) {
        console.error('Error al aplicar valores óptimos al proyecto:', err);
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            window.showToast('❌ Error al aplicar valores óptimos al proyecto');
        }
    }
}

if (typeof window !== 'undefined') {
    window.calcularEscenarioOptimoDesdeBase = calcularEscenarioOptimoDesdeBase;
    window.renderizarComparativaEscenarios = renderizarComparativaEscenarios;
    window.aplicarValoresOptimosAlProyecto = aplicarValoresOptimosAlProyecto;
}

/**
 * =========================================================================
 * AUDITORÍA ESTRATÉGICA MADRE (DSS - CORE PRO)
 * =========================================================================
 */

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function generarAuditoriaMadreFallback(contextoUi = {}) {
    const pol = String(contextoUi.pol || 'Rotterdam');
    const pod = String(contextoUi.pod || 'Houston');
    const cargoQty = Number(contextoUi.cargoQty || contextoUi.cargo || 30000);
    const commodity = String(contextoUi.commodity || 'Siderúrgico / Carga General');
    const flete = Number(contextoUi.fleteUnitario || contextoUi.fleteEstimado || contextoUi.freightSell || 37.0);
    const breakEven = Number(contextoUi.breakEvenUnitario || contextoUi.breakEven || 28.5);
    const loadRate = Number(contextoUi.loadRate || 5000);
    const dischargeRate = Number(contextoUi.dischargeRate || 2000);

    const marginPct = flete > 0 ? ((flete - breakEven) / flete) * 100 : 0;
    let veredicto = "🟡 Riesgo Moderado - Requiere Ajustes";
    let badgeClass = "bg-amber-100 text-amber-800 border-amber-300";
    if (marginPct >= 20 && dischargeRate >= 2500) {
        veredicto = "🟢 Favorable con Cláusulas Protectoras";
        badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
    } else if (flete < breakEven || marginPct < 8) {
        veredicto = "🔴 Desfavorable - Flete por debajo de Break-Even / Riesgo Operativo";
        badgeClass = "bg-rose-100 text-rose-800 border-rose-300";
    }

    const proposedFreight = Number((Math.max(flete * 1.08, breakEven * 1.18)).toFixed(2));
    const proposedDischargeRate = Math.max(dischargeRate, 2500);

    return {
        success: true,
        accion_ui: "renderizar_auditoria_dss",
        veredicto_general: veredicto,
        badge_class: badgeClass,
        reporte_estrategico: `Auditoría Estratégica Ejecutiva de MADRE para la operación ${pol} ➔ ${pod} (${cargoQty.toLocaleString('es-ES')} MT de ${commodity}).\n\nEl análisis financiero y operativo determina un Break-Even base de $${breakEven.toFixed(2)}/MT frente a un flete nominal de $${flete.toFixed(2)}/MT (Margen neto actual: ${marginPct.toFixed(1)}%).\n\nSe detecta un cuello de botella relevante en el ritmo de descarga (${dischargeRate.toLocaleString('es-ES')} MT/d) que dilata la permanencia en muelle frente a los días efectivos de mar. Asimismo, la ausencia de cláusulas específicas de congestión y régimen WWD SHINC traslada incertidumbre al armador. Se recomienda formalizar la Opción B estratégica, ajustando el flete a $${proposedFreight.toFixed(2)}/MT e implementando protecciones de plancha y laytime.`,
        variables_perjudiciales: [
            `Ritmo de descarga reducido (${dischargeRate.toLocaleString('es-ES')} MT/d) incrementa Port Days y reduce TCE`,
            `Exposición a demoras en atraque por congestión sin cláusula Reachable on Arrival`,
            `Margen comercial vulnerable a sobrecostes de combustible durante navegación de retorno`
        ],
        recomendaciones: [
            {
                accion: `Pactar ritmo de descarga garantizado a ${proposedDischargeRate.toLocaleString('es-ES')} MT/día WWD SHINC con medios de tierra`,
                pro: "Acorta la estancia portuaria proyectada en más de 1.8 días y elimina riesgos por festivos no computables.",
                contra: "Requiere que el fletador / receptor asuma la coordinación o sobrecoste de grúas en muelle."
            },
            {
                accion: `Incrementar Flete Unitario a $${proposedFreight.toFixed(2)} / MT (Opción B Estratégica)`,
                pro: "Garantiza un margen bruto robusto y absorbe posibles sobrecostes derivados de contingencias operativas.",
                contra: "Puede elevar la resistencia de contraoferta en la mesa de negociación inicial."
            },
            {
                accion: "Incorporar Cláusula WIBON / WIPON Protective Clause con preaviso NOR 24h",
                pro: "El tiempo perdido a la espera de muelle libre computa como tiempo de plancha efectivo protegiendo al buque.",
                contra: "Exige estricto control de registros de prácticos y capitanía para la validez del tender."
            }
        ],
        modificaciones_recap: {
            flete: proposedFreight,
            fleteUnitario: proposedFreight,
            allInRateGross: proposedFreight,
            loadRate: loadRate,
            dischargeRate: proposedDischargeRate,
            laytime: proposedDischargeRate,
            clausulas: "WWD SHINC DISCHARGE - REACHABLE ON ARRIVAL - BIMCO WAR RISKS (VOYWAR 2025) - TIME LOST WAITING BERTH TO COUNT AS LAYTIME"
        }
    };
}

export async function solicitarAuditoriaMadre() {
    const btn = document.getElementById('btn-auditoria-madre');
    const originalContent = btn ? btn.innerHTML : '';
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-teal-700"></i><span>Auditando MADRE...</span>`;
        }
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            window.showToast('Conectando con MADRE para Auditoría Estratégica...', true);
        }

        const currentDss = (typeof window !== 'undefined' && typeof window.getDSSCurrentState === 'function')
            ? window.getDSSCurrentState()
            : ((typeof window !== 'undefined' && (window.dssFormState || window.dssBaseActualState)) || {});

        const getVal = (id) => {
            if (typeof document === 'undefined') return undefined;
            const el = document.getElementById(id);
            return el ? el.value : undefined;
        };

        const contextoUi = {
            ...currentDss,
            pol: getVal('input-pol') || currentDss.pol || 'Rotterdam',
            pod: getVal('input-pod') || currentDss.pod || 'Houston',
            cargoQty: Number(getVal('input-cargoQty') || currentDss.cargoQty || 30000),
            commodity: getVal('input-commodity') || currentDss.commodity || 'Siderúrgico / Carga General',
            loadRate: Number(getVal('input-loadRate') || getVal('rate-load') || currentDss.loadRate || 5000),
            dischargeRate: Number(getVal('input-dischargeRate') || getVal('rate-disch') || currentDss.dischargeRate || 2000),
            laycanDaysLeft: Number(getVal('input-laycanDaysLeft') || currentDss.laycanDaysLeft || 10),
            estimatedVoyageDays: Number(getVal('input-estimatedVoyageDays') || currentDss.estimatedVoyageDays || 8),
            fleteUnitario: Number(getVal('input-fleteUnitario') || getVal('freight-sell') || currentDss.fleteUnitario || 37.0),
            breakEvenUnitario: Number(getVal('input-breakEvenUnitario') || currentDss.breakEvenUnitario || currentDss.breakEven || 28.5),
            allInRateGross: Number(currentDss.allInRateGross || currentDss.fleteUnitario || 37.0),
            activeScenario: (typeof window !== 'undefined' && window.dssActiveScenario) || 'actual',
            vesselName: (typeof window !== 'undefined' && window.State?.vessel) || currentDss.vesselName || 'MV GEARED BULKER',
            jwlaRiskActive: Boolean(currentDss.jwlaRiskActive),
            timestamp: new Date().toISOString()
        };

        const payload = {
            current_module: "decisiones",
            currentModule: "decisiones",
            contexto_ui: contextoUi,
            contexto: contextoUi,
            mensaje: "Auditoría Estratégica MADRE para el escenario actual de toma de decisiones."
        };

        let auditResult = null;
        try {
            const endpoint = (typeof window !== 'undefined' && typeof window.getApiUrl === 'function')
                ? window.getApiUrl('/api/cerebro-ia')
                : '/api/cerebro-ia';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const json = await response.json();
                if (json?.accion_ui === 'renderizar_auditoria_dss') {
                    auditResult = json;
                } else if (json?.payload?.accion_ui === 'renderizar_auditoria_dss') {
                    auditResult = json.payload;
                } else if (json?.data?.accion_ui === 'renderizar_auditoria_dss') {
                    auditResult = json.data;
                } else if (json?.auditoria?.accion_ui === 'renderizar_auditoria_dss') {
                    auditResult = json.auditoria;
                }
            }
        } catch (fetchErr) {
            console.warn('[Auditoría MADRE] Petición remota no disponible; procediendo con auditoría algorítmica local:', fetchErr);
        }

        if (!auditResult || auditResult.accion_ui !== 'renderizar_auditoria_dss') {
            auditResult = generarAuditoriaMadreFallback(contextoUi);
        }

        if (auditResult && auditResult.accion_ui === 'renderizar_auditoria_dss') {
            renderizarAuditoriaDss(auditResult);
            if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                window.showToast('✅ Auditoría Estratégica MADRE generada exitosamente');
            }
        }
    } catch (err) {
        console.error('Error al solicitar Auditoría MADRE:', err);
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            window.showToast('❌ Error al procesar Auditoría MADRE');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent || `<i class="fa-solid fa-shield-halved text-teal-700"></i><span>Auditoría MADRE</span>`;
        }
    }
}

export function renderizarAuditoriaDss(auditoriaData) {
    if (!auditoriaData || typeof document === 'undefined') return;
    if (typeof window !== 'undefined') {
        window.madreUltimaAuditoria = auditoriaData;
    }

    const veredicto = auditoriaData.veredicto_general || '🟡 Dictamen en Evaluación';
    const reporte = auditoriaData.reporte_estrategico || 'Sin reporte disponible.';
    const variables = Array.isArray(auditoriaData.variables_perjudiciales) ? auditoriaData.variables_perjudiciales : [];
    const recomendaciones = Array.isArray(auditoriaData.recomendaciones) ? auditoriaData.recomendaciones : [];

    const cardContainer = document.getElementById('tarjeta-resumen-auditoria-madre');
    if (cardContainer) {
        cardContainer.innerHTML = `
            <div class="bg-white border-2 border-teal-700/30 rounded-xl p-5 shadow-sm space-y-3 font-sans">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="p-2.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-lg shrink-0">
                            <i class="fa-solid fa-shield-halved"></i>
                        </span>
                        <div>
                            <div class="text-[11px] font-bold uppercase tracking-wider text-teal-800">
                                Auditoría Estratégica MADRE • Resumen Ejecutivo
                            </div>
                            <div class="text-base font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                                <span id="madre-veredicto-general-text">${escapeHtml(veredicto)}</span>
                            </div>
                        </div>
                    </div>
                    <button type="button" id="btn-ver-auditoria-completa" onclick="abrirAuditoriaMadreOffcanvas()" class="px-4 py-2 text-xs font-bold bg-teal-800 hover:bg-teal-700 text-white rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer self-start sm:self-center shrink-0">
                        <i class="fa-solid fa-list-check"></i>
                        <span>Ver Auditoría Completa</span>
                    </button>
                </div>
                <p class="text-xs text-gray-700 line-clamp-2 leading-relaxed">
                    ${escapeHtml(reporte.slice(0, 180))}...
                </p>
            </div>
        `;
        cardContainer.classList.remove('hidden');
    }

    const veredictoVal = document.getElementById('madre-offcanvas-veredicto-val');
    if (veredictoVal) veredictoVal.textContent = veredicto;

    const veredictoBadge = document.getElementById('madre-offcanvas-veredicto-badge');
    if (veredictoBadge) {
        let badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
        if (veredicto.includes('🟢')) badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
        else if (veredicto.includes('🔴')) badgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
        veredictoBadge.className = `px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${badgeColor}`;
        veredictoBadge.textContent = veredicto.includes('🟢') ? 'APROBADO' : (veredicto.includes('🔴') ? 'RIESGO CRÍTICO' : 'ATENCIÓN');
    }

    const reporteContainer = document.getElementById('madre-offcanvas-reporte');
    if (reporteContainer) {
        reporteContainer.textContent = reporte;
    }

    const varsContainer = document.getElementById('madre-offcanvas-variables');
    if (varsContainer) {
        if (variables.length === 0) {
            varsContainer.innerHTML = `<span class="text-xs text-gray-400 italic">No se identificaron variables perjudiciales críticas.</span>`;
        } else {
            varsContainer.innerHTML = variables.map((v, i) => {
                const isSevere = i === 0 || /demora|flete|inferior|desfavorable|congesti/i.test(v);
                const badgeStyle = isSevere
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200';
                return `
                    <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border shadow-sm ${badgeStyle}">
                        <i class="fa-solid fa-triangle-exclamation ${isSevere ? 'text-rose-600' : 'text-amber-600'}"></i>
                        <span>${escapeHtml(v)}</span>
                    </div>
                `;
            }).join('');
        }
    }

    const recsContainer = document.getElementById('madre-offcanvas-recomendaciones');
    if (recsContainer) {
        if (recomendaciones.length === 0) {
            recsContainer.innerHTML = `<span class="text-xs text-gray-400 italic">Sin recomendaciones adicionales.</span>`;
        } else {
            recsContainer.innerHTML = recomendaciones.map((rec, i) => `
                <div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
                    <div class="font-bold text-slate-900 text-sm flex items-start gap-2">
                        <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-xs shrink-0 font-extrabold mt-0.5">${i + 1}</span>
                        <span class="text-slate-900 font-bold">${escapeHtml(rec.accion || rec.action || '')}</span>
                    </div>
                    ${rec.pro ? `
                        <div class="mt-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md p-2.5 flex items-start gap-2">
                            <i class="fa-solid fa-circle-check text-emerald-600 mt-0.5 shrink-0"></i>
                            <div><strong class="font-bold text-emerald-900">Pro:</strong> ${escapeHtml(rec.pro)}</div>
                        </div>
                    ` : ''}
                    ${rec.contra ? `
                        <div class="mt-1.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md p-2.5 flex items-start gap-2">
                            <i class="fa-solid fa-circle-xmark text-rose-600 mt-0.5 shrink-0"></i>
                            <div><strong class="font-bold text-rose-900">Contra:</strong> ${escapeHtml(rec.contra)}</div>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }
    }
}

export function abrirAuditoriaMadreOffcanvas() {
    if (typeof document === 'undefined') return;
    const backdrop = document.getElementById('madre-offcanvas-backdrop');
    const panel = document.getElementById('madre-offcanvas-panel');
    if (backdrop) backdrop.classList.remove('hidden');
    if (panel) {
        panel.classList.remove('translate-x-full');
        panel.classList.add('translate-x-0');
    }
}

export function cerrarAuditoriaMadreOffcanvas() {
    if (typeof document === 'undefined') return;
    const backdrop = document.getElementById('madre-offcanvas-backdrop');
    const panel = document.getElementById('madre-offcanvas-panel');
    if (backdrop) backdrop.classList.add('hidden');
    if (panel) {
        panel.classList.add('translate-x-full');
        panel.classList.remove('translate-x-0');
    }
}

export async function generarFixtureRecapOpcionB() {
    try {
        const audit = (typeof window !== 'undefined') ? window.madreUltimaAuditoria : null;
        const mods = audit?.modificaciones_recap || {};

        const fleteMod = mods.flete ?? mods.fleteUnitario ?? mods.freightRate ?? mods.allInRateGross;
        if (fleteMod !== undefined && fleteMod !== null) {
            const numFlete = Number(fleteMod);
            if (!isNaN(numFlete) && numFlete > 0) {
                if (typeof window !== 'undefined') {
                    if (window.dssFormState) {
                        window.dssFormState.fleteUnitario = numFlete;
                        window.dssFormState.fleteEstimado = numFlete;
                        window.dssFormState.allInRateGross = numFlete;
                    }
                    if (window.dssBaseActualState) {
                        window.dssBaseActualState.fleteUnitario = numFlete;
                        window.dssBaseActualState.fleteEstimado = numFlete;
                        window.dssBaseActualState.allInRateGross = numFlete;
                    }
                    window.dssInjectedRecapFreight = numFlete;
                    if (window.State) {
                        window.State.freightSell = numFlete;
                        window.State.allInRateGross = numFlete;
                    }
                    if (window.SeaCharterStore?.set) {
                        window.SeaCharterStore.set({ freightSell: numFlete, allInRateGross: numFlete });
                    }
                }
                ['freight-sell', 'input-fleteUnitario', 'gc-freight-val', 'asb-freight-val'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.value = numFlete;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }
        }

        const loadMod = mods.loadRate ?? mods.laytimeLoad ?? mods.loadingRate;
        const dischMod = mods.dischargeRate ?? mods.laytimeDisch ?? mods.dischargingRate ?? mods.laytime;
        if (loadMod !== undefined && loadMod !== null) {
            const numLoad = Number(loadMod);
            if (!isNaN(numLoad) && numLoad > 0) {
                if (typeof window !== 'undefined') {
                    if (window.dssFormState) window.dssFormState.loadRate = numLoad;
                    if (window.dssBaseActualState) window.dssBaseActualState.loadRate = numLoad;
                    if (window.State) window.State.loadRate = numLoad;
                }
                ['rate-load', 'input-loadRate', 'gc-laytime-load-val'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.value = numLoad;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }
        }
        if (dischMod !== undefined && dischMod !== null) {
            const numDisch = Number(dischMod);
            if (!isNaN(numDisch) && numDisch > 0) {
                if (typeof window !== 'undefined') {
                    if (window.dssFormState) window.dssFormState.dischargeRate = numDisch;
                    if (window.dssBaseActualState) window.dssBaseActualState.dischargeRate = numDisch;
                    if (window.State) window.State.dischRate = numDisch;
                }
                ['rate-disch', 'input-dischargeRate', 'gc-laytime-disch-val'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.value = numDisch;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }
        }

        const clausulasMod = mods.clausulas ?? mods.specialClauses ?? mods.clausulasEspeciales;
        if (clausulasMod) {
            const strClausulas = String(clausulasMod);
            if (typeof window !== 'undefined') {
                if (window.dssFormState) {
                    window.dssFormState.clausulas = strClausulas;
                    window.dssFormState.specialClauses = strClausulas;
                    window.dssFormState.clausulasEspeciales = strClausulas;
                    window.dssFormState.clausulasEspecialesRecap = strClausulas;
                }
                if (window.dssBaseActualState) {
                    window.dssBaseActualState.clausulas = strClausulas;
                    window.dssBaseActualState.specialClauses = strClausulas;
                    window.dssBaseActualState.clausulasEspecialesRecap = strClausulas;
                }
                window.dssInjectedRecapClauses = strClausulas;
            }
        }

        if (typeof window !== 'undefined') {
            if (typeof window.sincronizarFormularioDesdeEstado === 'function' && window.dssFormState) {
                window.sincronizarFormularioDesdeEstado(window.dssFormState);
            }
            if (typeof window.actualizarDesdeFormulario === 'function') {
                window.actualizarDesdeFormulario();
            }
            if (typeof window.showToast === 'function') {
                window.showToast('✅ Modificaciones de MADRE aplicadas en memoria. Generando Fixture Recap (Opción B)...', true);
            }
        }

        if (typeof window !== 'undefined' && typeof window.generateFixtureRecapPDF === 'function') {
            await window.generateFixtureRecapPDF();
        } else if (typeof generateFixtureRecapPDF === 'function') {
            await generateFixtureRecapPDF();
        } else {
            console.warn('generateFixtureRecapPDF no está disponible en este contexto.');
        }
    } catch (err) {
        console.error('Error al generar Fixture Recap Opción B:', err);
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            window.showToast('❌ Error al generar Fixture Recap Opción B');
        }
    }
}

if (typeof window !== 'undefined') {
    window.solicitarAuditoriaMadre = solicitarAuditoriaMadre;
    window.renderizarAuditoriaDss = renderizarAuditoriaDss;
    window.abrirAuditoriaMadreOffcanvas = abrirAuditoriaMadreOffcanvas;
    window.cerrarAuditoriaMadreOffcanvas = cerrarAuditoriaMadreOffcanvas;
    window.generarFixtureRecapOpcionB = generarFixtureRecapOpcionB;
    window.generarAuditoriaMadreFallback = generarAuditoriaMadreFallback;
}

