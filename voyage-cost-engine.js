(function (root) {
    'use strict';

    const moneyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function toNumber(value) {
        return parseFloat(value) || 0;
    }

    function toText(value) {
        return String(value || '').trim();
    }

    function escapeHtml(value) {
        return toText(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    const RITMOS_BASE_PUERTO = {
        cinta_transportadora: 2500,
        camion_tolva: 1500,
        cuchara_grab: 1200,
        grua_portuaria_30mt: 1200,
        big_bags: 1200,
        paletizado: 1000,
        hierro_acero_piezas: 1000
    };
    const SMART_LOADING_BASE_RATE_PER_DAY = 1200;
    const SMART_LOADING_INTERFERENCE_FACTORS = {
        1: 1.0,
        2: 0.90,
        3: 0.85,
        4: 0.80
    };
    const FACTORES_ESTIBA = {
        cinta_transportadora: 1.0,
        camion_tolva: 1.0,
        cuchara_grab: 1.0,
        grua_portuaria_30mt: 1.0,
        big_bags: 1.0,
        paletizado: 1.0,
        hierro_acero_piezas: 1.0
    };
    const PASSIVE_PORT_METHODS = new Set(['cinta_transportadora', 'camion_tolva']);
    const ISLAMIC_WEEKEND_COUNTRIES = Object.freeze([
        'Algeria',
        'United Arab Emirates',
        'Saudi Arabia',
        'Egypt',
        'Qatar',
        'Oman',
        'Kuwait',
        'Iraq',
        'Libya',
        'Bahrain'
    ]);
    const ISLAMIC_WEEKEND_COUNTRY_CODES = new Set(['DZ', 'AE', 'SA', 'EG', 'QA', 'OM', 'KW', 'IQ', 'LY', 'BH']);
    const DAY_IN_MS = 24 * 60 * 60 * 1000;

    function normalizeCountryKey(value) {
        return toText(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
    }

    function parseOperationalDate(value) {
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
        }
        const text = toText(value);
        if (!text) return null;
        const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const date = isoDate
            ? new Date(Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])))
            : new Date(text);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function usesFridayWeekend(portCountry) {
        const normalizedCountry = normalizeCountryKey(portCountry);
        if (ISLAMIC_WEEKEND_COUNTRY_CODES.has(normalizedCountry)) return true;
        return ISLAMIC_WEEKEND_COUNTRIES.some((country) => normalizeCountryKey(country) === normalizedCountry);
    }

    function calculateOperationalRisk(basePDA, etaDate, portDays, portCountry, vesselDraft, portMaxDraft, operationalContext = {}) {
        const normalizedPda = Math.max(0, toNumber(basePDA));
        const normalizedPortDays = Math.max(0, toNumber(portDays));
        const startDate = parseOperationalDate(etaDate);
        const fridayWeekend = usesFridayWeekend(portCountry);
        let hasWeekendPenalty = false;
        const weekendDates = [];

        if (startDate && normalizedPortDays > 0) {
            const startTime = startDate.getTime();
            const endTime = startTime + (normalizedPortDays * DAY_IN_MS);
            const cursor = new Date(startTime);
            cursor.setUTCHours(0, 0, 0, 0);
            while (cursor.getTime() <= endTime) {
                const day = cursor.getUTCDay();
                const isWeekendDay = fridayWeekend ? day === 5 : day === 0 || day === 6;
                if (isWeekendDay) {
                    hasWeekendPenalty = true;
                    weekendDates.push(cursor.toISOString().slice(0, 10));
                }
                cursor.setUTCDate(cursor.getUTCDate() + 1);
            }
        }

        const normalizedVesselDraft = Math.max(0, toNumber(vesselDraft));
        const normalizedPortMaxDraft = Math.max(0, toNumber(portMaxDraft));
        const isDraftExceeded = normalizedVesselDraft > 0
            && normalizedPortMaxDraft > 0
            && normalizedVesselDraft > normalizedPortMaxDraft;
        const hasAdjustedRates = Boolean(operationalContext?.hasAdjustedRates);
        const riskLevel = isDraftExceeded
            ? 'ALTO'
            : (hasWeekendPenalty || hasAdjustedRates ? 'MODERADO' : 'BAJO');
        const adjustedPDA = hasWeekendPenalty ? normalizedPda * 1.15 : normalizedPda;

        return {
            adjustedPDA,
            basePDA: normalizedPda,
            penaltyAmount: adjustedPDA - normalizedPda,
            hasWeekendPenalty,
            isDraftExceeded,
            hasAdjustedRates,
            riskLevel,
            portCountry: toText(portCountry),
            weekendDates
        };
    }

    function updateExecutiveDashboard(calcResults = {}, riskData = {}, documentRef = root.document) {
        if (!documentRef || typeof documentRef.getElementById !== 'function') return false;

        const setText = (id, value) => {
            const element = documentRef.getElementById(id);
            if (!element || value === undefined || value === null) return;
            element.textContent = String(value);
        };
        const formatMoney = (value, decimals = 0) => {
            const amount = Number(value);
            if (!Number.isFinite(amount)) return '$0';
            const sign = amount > 0 ? '+' : '';
            return `${sign}${amount.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            })}`;
        };
        const formatRate = (value) => `$${Math.max(0, toNumber(value)).toFixed(2)} / MT`;
        const formatDays = (value) => `${Math.max(0, toNumber(value)).toFixed(1)} días`;
        const formatTons = (value) => `${Math.max(0, toNumber(value)).toLocaleString('en-US', { maximumFractionDigits: 0 })} MT`;
        const formatDailyRate = (value) => `${Math.max(0, toNumber(value)).toLocaleString('en-US', { maximumFractionDigits: 0 })} MT/día`;

        setText('exec-pol', calcResults.pol || 'POL');
        setText('exec-pod', calcResults.pod || 'POD');
        setText('exec-total-profit', formatMoney(calcResults.totalProfit));
        setText('exec-total-margin', formatMoney(calcResults.totalProfit));
        setText('exec-cargo-qty', formatTons(calcResults.cargoQty));
        setText('exec-cargo-type', calcResults.cargoType || 'Carga no definida');
        setText('exec-load-rate', formatDailyRate(calcResults.loadRate));
        setText('exec-disch-rate', formatDailyRate(calcResults.dischargeRate));
        setText('exec-vessel-type', calcResults.vesselType || 'Buque no definido');
        setText('exec-sea-days', formatDays(calcResults.seaDays));
        setText('exec-port-days', formatDays(calcResults.portDays));
        setText('exec-total-days', formatDays(calcResults.totalDays));
        setText('exec-buy-freight', formatRate(calcResults.buyFreight));
        setText('exec-tce', `${formatMoney(calcResults.tce)} / día`);
        setText('exec-sell-freight', formatRate(calcResults.sellFreight));
        setText('exec-charterer-profit', formatMoney(calcResults.chartererProfit));
        setText('exec-spread-mt', `${formatMoney(toNumber(calcResults.sellFreight) - toNumber(calcResults.buyFreight), 2)} / MT`);

        const riskLevel = ['BAJO', 'MODERADO', 'ALTO'].includes(riskData.riskLevel) ? riskData.riskLevel : 'BAJO';
        const riskElement = documentRef.getElementById('exec-risk-level');
        const riskStyles = {
            BAJO: { color: '#047857', backgroundColor: '#d1fae5' },
            MODERADO: { color: '#b45309', backgroundColor: '#fef3c7' },
            ALTO: { color: '#b91c1c', backgroundColor: '#fee2e2' }
        };
        if (riskElement) {
            riskElement.textContent = riskLevel;
            riskElement.style.color = riskStyles[riskLevel].color;
            riskElement.style.backgroundColor = riskStyles[riskLevel].backgroundColor;
            riskElement.style.padding = '0.2rem 0.55rem';
            riskElement.style.borderRadius = '9999px';
        }

        const countries = Array.isArray(riskData.penaltyCountries)
            ? riskData.penaltyCountries.filter(Boolean)
            : [riskData.portCountry].filter(Boolean);
        const insightParts = ['Operación sólida.'];
        if (riskData.hasWeekendPenalty) {
            insightParts.push(`Se ha aplicado un recargo automático de 15% en PDA por operativa en fin de semana${countries.length ? ` en ${countries.join(' y ')}` : ''}.`);
        } else {
            insightParts.push('No se requieren recargos de Overtime por calendario portuario.');
        }
        if (riskData.isDraftExceeded) {
            insightParts.push('El calado del buque supera el límite operativo informado por WPI; requiere revisión inmediata.');
        } else if (riskData.hasDraftData === false) {
            insightParts.push('El límite de calado WPI no está disponible y requiere validación manual.');
        } else {
            insightParts.push('Calado del buque dentro de los límites del puerto.');
        }
        if (riskData.hasAdjustedRates) {
            insightParts.push('Los ritmos operativos contienen ajustes y elevan el seguimiento a riesgo moderado.');
        }
        setText('exec-insight-text', insightParts.join(' '));
        return true;
    }

    // =========================================================================
    // F\u00cdSICA DE IZADA \u2014 BIG BAGS MANIPULADOS CON GR\u00daA PORTUARIA (PORT CRANE)
    // Cada puerto del itinerario (POL / POD) es un nodo modular independiente:
    // estas constantes se resuelven por puerto y nunca se heredan del otro
    // extremo del viaje.
    //   \u00b7 Esparcidor m\u00faltiple: 14 big bags izados simult\u00e1neamente.
    //   \u00b7 Peso de referencia por big bag: 1.5 MT.
    //   \u00b7 Carga total por ciclo (lift capacity): 14 \u00d7 1.5 = 21.0 MT fijos.
    //   \u00b7 La tara del accesorio ya est\u00e1 contenida en el peso de referencia.
    //   \u00b7 Eficiencia operativa 70\u201380%: modela obligatoriamente la espera de la
    //     gr\u00faa por la log\u00edstica terrestre (llegada y posicionamiento de camiones
    //     bajo el gancho). Nunca se asume eficiencia mec\u00e1nica del 100%.
    // =========================================================================
    const BIG_BAGS_PORT_CRANE = Object.freeze({
        bagsPerLift: 14,
        bagWeightMt: 1.5,
        liftCapacityMt: 21.0,
        taraMt: 0,
        operatingHoursPerDay: 24,
        efficiencyMinPct: 70,
        efficiencyMaxPct: 80,
        efficiencyDefaultPct: 75
    });

    function normalizeText(value) {
        return toText(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
    }

    // Acepta indistintamente etiquetas ("Big Bags - Gr\u00faa Portuaria") y valores
    // de m\u00e9todo ("big_bags_portuaria"), normalizando guiones y subrayados.
    function normalizeMethodKey(value) {
        return normalizeText(value).replace(/[_\-]+/g, ' ');
    }

    // Gear explícitamente distinto del esparcidor de big bags: aunque la grúa sea
    // portuaria y la mercancía venga en big bags, una cuchara, un accesorio de
    // paletizado o un útil siderúrgico no izan 14 bolsas por ciclo.
    const NON_BIG_BAG_GEAR_KEYWORDS = Object.freeze(['CUCHARA', 'GRAB', 'PALETIZADO', 'HIERRO', 'ACERO', 'CINTA', 'BOMBAS', 'TOLVA']);

    function isBigBagsPortCraneMethod(method, cargoType = '') {
        const normalizedMethod = normalizeMethodKey(method);
        const usesPortCrane = normalizedMethod.includes('PORTUARIA') || normalizedMethod.includes('PORT CRANE');
        if (!usesPortCrane) return false;
        if (normalizedMethod.includes('BIG BAG')) return true;
        if (NON_BIG_BAG_GEAR_KEYWORDS.some((keyword) => normalizedMethod.includes(keyword))) return false;
        return normalizeMethodKey(cargoType).includes('BIG BAG');
    }

    function getBigBagsPortCraneLiftCapacityMt() {
        return BIG_BAGS_PORT_CRANE.bagsPerLift * BIG_BAGS_PORT_CRANE.bagWeightMt;
    }

    // Cuello de botella terrestre: los patios peque\u00f1os rotan camiones peor, y
    // las terminales que sirven buques mayores ofrecen m\u00e1s carriles bajo el
    // gancho. El resultado permanece siempre dentro de la banda 70\u201380%.
    function getBigBagsPortCraneEfficiencyPct(vesselClass = '') {
        const normalizedClass = normalizeText(vesselClass);
        if (normalizedClass.includes('COASTER') || normalizedClass.includes('MINI')) {
            return BIG_BAGS_PORT_CRANE.efficiencyMinPct;
        }
        if (normalizedClass.includes('SUPRAMAX')
            || normalizedClass.includes('ULTRAMAX')
            || normalizedClass.includes('PANAMAX')
            || normalizedClass.includes('CAPESIZE')) {
            return BIG_BAGS_PORT_CRANE.efficiencyMaxPct;
        }
        return BIG_BAGS_PORT_CRANE.efficiencyDefaultPct;
    }

    // Rendimiento te\u00f3rico (MT/d\u00eda) = 21.0 MT \u00d7 ciclos/hora \u00d7 horas operativas
    // \u00d7 n\u00ba de gr\u00faas, reducido por la eficiencia operativa.
    function calculateBigBagsPortCraneDailyRate(options = {}) {
        const {
            cyclesPerHour = 0,
            cranes = 1,
            efficiencyPct = BIG_BAGS_PORT_CRANE.efficiencyDefaultPct,
            operatingHoursPerDay = BIG_BAGS_PORT_CRANE.operatingHoursPerDay,
            liftCapacityMt = getBigBagsPortCraneLiftCapacityMt()
        } = options;

        const cycles = Math.max(0, toNumber(cyclesPerHour));
        const craneCount = Math.max(1, Math.floor(toNumber(cranes) || 1));
        const hours = Math.max(0, toNumber(operatingHoursPerDay));
        const lift = Math.max(0, toNumber(liftCapacityMt));
        const efficiency = Math.min(100, Math.max(1, toNumber(efficiencyPct) || BIG_BAGS_PORT_CRANE.efficiencyDefaultPct));
        if (cycles <= 0 || hours <= 0 || lift <= 0) return 0;

        const theoreticalMtPerDay = lift * cycles * hours * craneCount;
        return Math.max(0, Math.round(theoreticalMtPerDay * (efficiency / 100)));
    }

    function includesAny(value, keywords) {
        const normalized = normalizeText(value);
        return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
    }

    function normalizeCargoType(value) {
        const normalized = normalizeText(value);
        if (normalized.includes('PROYECTO') || normalized.includes('ESPECIAL')) return 'proyecto';
        if (normalized.includes('HIERRO') || normalized.includes('ACERO')) return 'acero';
        if (normalized.includes('GRANEL')) return 'granel';
        return 'general';
    }

    function detectEffectiveCanal(state) {
        const pol = toText(state.pol_name);
        const pod = toText(state.pod_name);
        const atlMed = ['ORAN', 'DZ', 'ALGERIA', 'SPAIN', 'MED', 'EUROPE', 'ATLANTIC', 'USG', 'HOUSTON', 'BARCELONA', 'ITALY', 'GIBRALTAR', 'EGYPT MED', 'ROTTERDAM', 'TUNISIA', 'NEW ORLEANS', 'BRAZIL', 'CARIBBEAN'];
        const pacific = ['MANZANILLO', 'MX', 'MEXICO', 'CHILE', 'PERU', 'USWC', 'PACIFIC', 'ECUADOR', 'VALPARAISO', 'CALLAO', 'LOS ANGELES'];
        const asiaRedSea = ['SINGAPORE', 'SGSIN', 'CHINA', 'INDIA', 'JEDDAH', 'RED SEA', 'SUEZ', 'SHANGHAI', 'MUMBAI', 'PERSIAN GULF'];

        const polAtlMed = includesAny(pol, atlMed);
        const podAtlMed = includesAny(pod, atlMed);
        const polPacific = includesAny(pol, pacific);
        const podPacific = includesAny(pod, pacific);
        const polAsiaRedSea = includesAny(pol, asiaRedSea);
        const podAsiaRedSea = includesAny(pod, asiaRedSea);
        if ((polAtlMed && podPacific) || (podAtlMed && polPacific)) {
            return 'Panamá';
        }

        if ((polAtlMed && podAsiaRedSea) || (podAtlMed && polAsiaRedSea)) {
            return 'Suez';
        }

        return 'Ninguno';
    }

    function estimateNetTonnage(dwt, canal) {
        if (canal === 'Suez') return toNumber(dwt) * 0.50;
        if (canal === 'Panamá' || canal === 'Panama') return toNumber(dwt) * 0.47;
        return 0;
    }

    function estimateMaxSummerDraft(dwt) {
        return (toNumber(dwt) * 0.00015) + 5.5;
    }

    function estimateBallastDraft(maxDraft) {
        return toNumber(maxDraft) * 0.45;
    }

    function estimateDraft(dwt, cargoTons) {
        const capacidadDwt = toNumber(dwt);
        if (capacidadDwt <= 0) return 0;
        const maxDraft = estimateMaxSummerDraft(capacidadDwt);
        const ballastDraft = estimateBallastDraft(maxDraft);
        const cargaRatio = toNumber(cargoTons) / capacidadDwt;
        return ballastDraft + ((maxDraft - ballastDraft) * cargaRatio);
    }

    function estimateCraneSwl(dwt) {
        const value = toNumber(dwt);
        if (value >= 25000 && value <= 65000) return 30;
        if (value > 0 && value < 25000) return 25;
        return 0;
    }

    function estimateGrabCapacity() {
        return 12;
    }

    function estimateDailyOpexByDwt(dwt) {
        const value = toNumber(dwt);
        if (value <= 0) return 0;
        if (value < 20000) return 4800;
        if (value < 40000) return 5600;
        if (value < 65000) return 6100;
        if (value < 85000) return 6600;
        return 7500;
    }

    function inferTugCostByDwt(dwt, manualUnitCost) {
        const value = toNumber(dwt);
        const manualCost = toNumber(manualUnitCost);
        let tugsPorManiobra = 0;
        let tarifaBaseUd = 0;

        if (value > 0 && value < 20000) {
            tugsPorManiobra = 1;
            tarifaBaseUd = 1200;
        } else if (value >= 20000 && value < 65000) {
            tugsPorManiobra = 2;
            tarifaBaseUd = value >= 40000 ? 1500 : 1200;
        } else if (value >= 65000) {
            tugsPorManiobra = 3;
            tarifaBaseUd = 1500;
        }

        const tarifaEfectivaUd = manualCost > 0 ? manualCost : tarifaBaseUd;
        const totalUsosRemolcador = tugsPorManiobra * 4;

        return {
            tugs_por_maniobra: tugsPorManiobra,
            tarifa_base_ud: tarifaBaseUd,
            tarifa_efectiva_ud: tarifaEfectivaUd,
            total_usos_remolcador: totalUsosRemolcador,
            coste_total_tugs: tarifaEfectivaUd * totalUsosRemolcador,
            inferred: manualCost <= 0 && tarifaBaseUd > 0
        };
    }

    function calculateWarRiskPremium(canal) {
        return canal === 'Suez' ? 45000 : 0;
    }

    function calculateTurnTimeDays(policyType) {
        return normalizeText(policyType) === 'GENCON' ? 1.0 : 0;
    }

    function getStowageMethodFactor(method) {
        return FACTORES_ESTIBA[method] || FACTORES_ESTIBA.cinta_transportadora;
    }

    function getRealPortRate(method) {
        return RITMOS_BASE_PUERTO[method] || RITMOS_BASE_PUERTO.cinta_transportadora;
    }

    function portMethodUsesCranes(method) {
        return !PASSIVE_PORT_METHODS.has(method);
    }

    function calculatePortDaysByStowage(cargoTons, method, realRate, cargoType, craneCount = 1) {
        const cargo = toNumber(cargoTons);
        const rate = toNumber(realRate) || getRealPortRate(method);
        if (cargo <= 0 || rate <= 0) return 0;
        return cargo / rate;
    }

    function calculateRealLoadRate(cranes = 1) {
        const craneCount = Math.min(4, Math.max(1, Math.floor(toNumber(cranes) || 1)));
        const interferenceFactor = SMART_LOADING_INTERFERENCE_FACTORS[craneCount] || SMART_LOADING_INTERFERENCE_FACTORS[4];
        return SMART_LOADING_BASE_RATE_PER_DAY * craneCount * interferenceFactor;
    }

    function calculateDemurrageExposure(cargoQuantity, realRate, contractualRate, dailyDemurrageRate) {
        const cargo = Math.max(0, toNumber(cargoQuantity));
        const real = Math.max(0, toNumber(realRate));
        const contractual = Math.max(0, toNumber(contractualRate));
        const dailyRate = Math.max(0, toNumber(dailyDemurrageRate));
        if (cargo <= 0 || real <= 0 || contractual <= real) {
            return { active: false, realDays: 0, contractualDays: 0, exposedDays: 0, financialExposure: 0 };
        }
        const realDays = cargo / real;
        const contractualDays = cargo / contractual;
        const exposedDays = Math.max(0, realDays - contractualDays);
        return {
            active: exposedDays > 0,
            realDays,
            contractualDays,
            exposedDays,
            financialExposure: exposedDays * dailyRate
        };
    }

    function shouldAutoEstimateStevedoring(policyType) {
        return normalizeText(policyType).includes('LINER');
    }

    function estimateStevedoringTerminal(cargoTons) {
        return toNumber(cargoTons) * 2.50;
    }

    function isTbnVesselName(value) {
        const normalized = normalizeText(value);
        return !normalized || normalized === 'TBN' || normalized.includes('TO BE NOMINATED');
    }

    function applyTechnicalFallbacks(state) {
        const canalEfectivo = detectEffectiveCanal(state);
        const dwt = toNumber(state.capacidad_dwt);
        const effectiveState = { ...state, canal_efectivo: canalEfectivo, canal_seleccionado: canalEfectivo };
        const fallbacks = {};

        if (dwt > 0 && toNumber(effectiveState.tonelaje_neto) <= 0) {
            const estimated = estimateNetTonnage(dwt, canalEfectivo);
            if (estimated > 0) {
                effectiveState.tonelaje_neto = estimated;
                fallbacks.tonelaje_neto = estimated;
            }
        }

        if (dwt > 0 && toNumber(effectiveState.calado_actual) <= 0) {
            const estimated = estimateDraft(dwt, effectiveState.toneladas_carga);
            effectiveState.calado_actual = estimated;
            fallbacks.calado_actual = estimated;
        }

        if (dwt > 0 && toNumber(effectiveState.crane_swl_mt) <= 0) {
            const estimated = estimateCraneSwl(dwt);
            if (estimated > 0) {
                effectiveState.crane_swl_mt = estimated;
                fallbacks.crane_swl_mt = estimated;
            }
        }

        if (toNumber(effectiveState.grab_capacity_cbm) <= 0) {
            const estimated = estimateGrabCapacity();
            effectiveState.grab_capacity_cbm = estimated;
            fallbacks.grab_capacity_cbm = estimated;
        }

        if (dwt > 0 && (toNumber(effectiveState.opex_fijo_diario) <= 0 || isTbnVesselName(effectiveState.nombre_buque))) {
            const estimated = estimateDailyOpexByDwt(dwt);
            if (estimated > 0) {
                effectiveState.opex_fijo_diario = estimated;
                fallbacks.opex_fijo_diario = estimated;
            }
        }

        if (toNumber(effectiveState.estiba_terminal) <= 0 && shouldAutoEstimateStevedoring(effectiveState.charter_party_standard)) {
            const estimated = estimateStevedoringTerminal(effectiveState.toneladas_carga);
            if (estimated > 0) {
                effectiveState.estiba_terminal = estimated;
                fallbacks.estiba_terminal = estimated;
            }
        }

        const tugInference = inferTugCostByDwt(dwt, effectiveState.coste_remolcadores_ud);
        effectiveState.coste_remolcadores_ud = tugInference.tarifa_efectiva_ud;
        effectiveState.tugs_por_maniobra = tugInference.tugs_por_maniobra;
        effectiveState.total_usos_remolcador = tugInference.total_usos_remolcador;
        effectiveState.coste_total_tugs = tugInference.coste_total_tugs;
        if (tugInference.inferred) {
            fallbacks.coste_remolcadores_ud = tugInference.tarifa_base_ud;
        }

        return { state: effectiveState, fallbacks, canal_efectivo: canalEfectivo };
    }

    function calculateBunkers(state) {
        const diasFondeo = toNumber(state.t_espera_fondeo);
        const diasPuertoTotal = Math.max(0, toNumber(state.dias_puerto_total || state.dias_puerto) - diasFondeo);
        const consumoFondeo = toNumber(state.consumo_fondeo_td || state.consumo_anchorage_td);
        const consumoAuxiliarFondeo = toNumber(state.consumo_auxiliar_fondeo_td);
        const costeFondeo = diasFondeo * consumoFondeo * toNumber(state.precio_mgo);
        const costeAuxiliarFondeo = diasFondeo * consumoAuxiliarFondeo * toNumber(state.precio_mgo);
        const precioMar = state.has_scrubber ? toNumber(state.precio_ifo380) : toNumber(state.precio_vlsfo);
        return (toNumber(state.dias_navegacion) * toNumber(state.consumo_mar_td) * precioMar) +
            (diasPuertoTotal * toNumber(state.consumo_puerto_td) * toNumber(state.precio_mgo)) +
            costeFondeo +
            costeAuxiliarFondeo;
    }

    function calculateOpex(state) {
        const diasPuertoTotal = toNumber(state.dias_puerto_total || state.dias_puerto);
        return (toNumber(state.dias_navegacion) + diasPuertoTotal) * toNumber(state.opex_fijo_diario);
    }

    function calculateCanalToll(state) {
        const canal = state.canal_efectivo || state.canal_seleccionado || 'Ninguno';
        const maxDraft = toNumber(state.max_summer_draft);
        const currentDraft = toNumber(state.calado_actual);
        const inferredMaxDraft = currentDraft > 0 ? currentDraft * 1.1 : 0;
        const caladoRatio = (maxDraft > 0 || inferredMaxDraft > 0) ? currentDraft / (maxDraft || inferredMaxDraft) : 0;
        const estado = caladoRatio > 0.82 ? 'Laden' : 'Ballast';
        const tonelajeNeto = toNumber(state.tonelaje_neto);
        const toneladasCarga = toNumber(state.toneladas_carga);

        if (canal === 'Panamá' || canal === 'Panama') {
            let baseToll = tonelajeNeto * 5.20;
            const cargoFee = estado === 'Laden' ? toneladasCarga * 3.50 : 0;
            const fixedFees = 15000;
            if (estado === 'Ballast') baseToll *= 0.85;
            const warRiskPremium = calculateWarRiskPremium(canal);
            return { extras_canal: baseToll + cargoFee + fixedFees + warRiskPremium, war_risk_premium: warRiskPremium, estado, calado_ratio: caladoRatio };
        }

        if (canal === 'Suez') {
            let baseToll = tonelajeNeto * 4.10;
            const cargoFee = estado === 'Laden' ? toneladasCarga * 1.80 : 0;
            const fixedFees = 22000;
            if (estado === 'Ballast') baseToll *= 0.85;
            const warRiskPremium = calculateWarRiskPremium(canal);
            return { extras_canal: baseToll + cargoFee + fixedFees + warRiskPremium, war_risk_premium: warRiskPremium, estado, calado_ratio: caladoRatio };
        }

        return { extras_canal: 0, war_risk_premium: 0, estado, calado_ratio: caladoRatio };
    }

    function validateCranes(state) {
        const factorEstiba = toNumber(state.factor_estiba);
        const grabCapacity = toNumber(state.grab_capacity_cbm);
        const craneSwl = toNumber(state.crane_swl_mt);
        const densidadCarga = factorEstiba > 0 ? 1 / factorEstiba : 0;
        const pesoPieza = toNumber(state.peso_pieza_mt);
        const ciclosHora = toNumber(state.ciclos_hora_grua);
        const requiresPieceInputs = normalizeCargoType(state.tipo_carga) === 'acero';
        const pesoCargaCiclo = grabCapacity * densidadCarga;
        const taraCuchara = grabCapacity * 0.4;
        const pesoTotalIzado = pesoCargaCiclo + taraCuchara;
        const pieceOverload = pesoPieza > 0 && craneSwl > 0 && pesoPieza > craneSwl;

        return {
            densidad_carga: densidadCarga,
            peso_carga_ciclo: pesoCargaCiclo,
            tara_cuchara: taraCuchara,
            peso_total_izado: pesoTotalIzado,
            peso_pieza_mt: pesoPieza,
            ciclos_hora_grua: ciclosHora,
            missing_piece_inputs: requiresPieceInputs && (pesoPieza <= 0 || ciclosHora <= 0),
            piece_overload: pieceOverload,
            overload: pieceOverload || (craneSwl > 0 && pesoTotalIzado > craneSwl)
        };
    }

    function calculateTotals(state, extrasCanal, tugCost) {
        const costeBunkers = calculateBunkers(state);
        const costeOpexTotal = calculateOpex(state);
        const cargoKind = normalizeCargoType(state.tipo_carga);
        const costeTrincaje = (cargoKind === 'acero' || cargoKind === 'proyecto') ? toNumber(state.coste_trincaje) : 0;
        const costeManiobraEspecial = cargoKind === 'proyecto' ? toNumber(state.coste_maniobra_especial) : 0;
        const costeTotalViaje = costeBunkers +
            costeOpexTotal +
            toNumber(state.pda_pol) +
            toNumber(state.pda_pod) +
            toNumber(state.estiba_terminal) +
            costeTrincaje +
            costeManiobraEspecial +
            toNumber(extrasCanal) +
            toNumber(tugCost);
        const breakEvenOperativo = toNumber(state.toneladas_carga) > 0 ? costeTotalViaje / toNumber(state.toneladas_carga) : 0;
        const commissionFactor = 1 - (toNumber(state.comisiones_porcentaje) / 100);
        const breakEven = commissionFactor > 0 ? breakEvenOperativo / commissionFactor : 0;

        return {
            coste_bunkers: costeBunkers,
            coste_opex_total: costeOpexTotal,
            coste_estiba_terminal: toNumber(state.estiba_terminal),
            coste_trincaje: costeTrincaje,
            coste_total_viaje: costeTotalViaje,
            break_even_operativo: breakEvenOperativo,
            break_even: breakEven
        };
    }

    function calculateVoyageCostState(state) {
        const fallbackResult = applyTechnicalFallbacks(state);
        const effectiveState = fallbackResult.state;
        effectiveState.turn_time_days = Math.max(0, toNumber(effectiveState.turn_time_hours)) / 24;
        effectiveState.dias_puerto_total = toNumber(effectiveState.dias_puerto) +
            effectiveState.turn_time_days;
        const canal = calculateCanalToll(effectiveState);
        const cranes = validateCranes(effectiveState);
        const tugs = inferTugCostByDwt(effectiveState.capacidad_dwt, state.coste_remolcadores_ud);
        const totals = calculateTotals(effectiveState, canal.extras_canal, tugs.coste_total_tugs);
        return { ...totals, canal, cranes, tugs, fallbacks: fallbackResult.fallbacks, canal_efectivo: fallbackResult.canal_efectivo, state: effectiveState };
    }

    const DEFAULT_LUMPSUM_TARGET_BASE_MT = 5000;

    /**
     * Resolves the billable tonnage base shared by purchase (owner) and sale (charterer).
     * Lumpsum is never inferred from the cargo size: it is an explicit commercial decision
     * (isLumpsumMode) and it is always capped by the physical capacity of the vessel (DWT).
     */
    function resolveFreightBase(options = {}) {
        const actualCargoMT = Math.max(0, toNumber(options.actualCargoMT));
        const vesselDWT = Math.max(0, toNumber(options.vesselDWT));
        const isLumpsumMode = Boolean(options.isLumpsumMode);
        const requestedTargetBase = options.targetLumpsumBase === undefined || options.targetLumpsumBase === null || options.targetLumpsumBase === ''
            ? DEFAULT_LUMPSUM_TARGET_BASE_MT
            : toNumber(options.targetLumpsumBase);
        const targetLumpsumBase = Math.max(0, requestedTargetBase);

        if (!isLumpsumMode) {
            return {
                isLumpsumMode: false,
                mode: 'PMT',
                actualCargoMT,
                vesselDWT,
                targetLumpsumBase,
                finalLumpsumBase: 0,
                freightBaseMT: actualCargoMT,
                dwtCapApplied: false,
                dwtCapDeltaMT: 0
            };
        }

        // Physical cap: it is impossible to invoice more tonnage than the vessel can lift.
        const finalLumpsumBase = vesselDWT > 0
            ? Math.min(targetLumpsumBase, vesselDWT)
            : targetLumpsumBase;

        return {
            isLumpsumMode: true,
            mode: 'LUMPSUM',
            actualCargoMT,
            vesselDWT,
            targetLumpsumBase,
            finalLumpsumBase,
            freightBaseMT: finalLumpsumBase,
            dwtCapApplied: vesselDWT > 0 && vesselDWT < targetLumpsumBase,
            dwtCapDeltaMT: Math.max(0, targetLumpsumBase - finalLumpsumBase)
        };
    }

    /**
     * Symmetric voyage financials. The same tonnage base always drives both sides of the
     * trade, so no phantom arbitrage can be produced by billing the sale on one base and
     * the purchase on another.
     */
    function calculateVoyageFinancials(params = {}) {
        const base = resolveFreightBase(params);
        const freightBaseMT = base.freightBaseMT;
        const ownerRate = Math.max(0, toNumber(params.ownerRate));
        const chartererRate = Math.max(0, toNumber(params.chartererRate));
        const commissionPct = Math.min(100, Math.max(0, toNumber(params.commissionPct)));
        const revenueExtras = toNumber(params.revenueExtras);
        const additionalCosts = toNumber(params.additionalCosts);

        // Sale side (charterer revenue) and purchase side (owner freight cost) share freightBaseMT.
        const grossRevenue = freightBaseMT * chartererRate;
        const ownerFreightCost = freightBaseMT * ownerRate;
        const commissionCost = grossRevenue * (commissionPct / 100);

        const totalRevenue = roundMoney(grossRevenue + revenueExtras);
        const totalCost = roundMoney(ownerFreightCost + commissionCost + additionalCosts);
        const netProfit = roundMoney(totalRevenue - totalCost);

        return {
            ...base,
            ownerRate,
            chartererRate,
            commissionPct,
            grossRevenue: roundMoney(grossRevenue),
            revenueExtras: roundMoney(revenueExtras),
            ownerFreightCost: roundMoney(ownerFreightCost),
            commissionCost: roundMoney(commissionCost),
            additionalCosts: roundMoney(additionalCosts),
            totalRevenue,
            totalCost,
            netProfit,
            netMarginPct: totalRevenue > 0 ? roundMoney((netProfit / totalRevenue) * 100) : 0,
            // Equivalent rates over the tonnage physically carried, for display only.
            effectiveOwnerRatePerMT: base.actualCargoMT > 0 ? roundMoney(ownerFreightCost / base.actualCargoMT) : 0,
            effectiveChartererRatePerMT: base.actualCargoMT > 0 ? roundMoney(grossRevenue / base.actualCargoMT) : 0
        };
    }

    const RISK_SCENARIOS = Object.freeze([
        { key: 'best', label: 'Escenario Óptimo', speedFactor: 1.10, bunkerFactor: 0.95, portDelayDays: 0 },
        { key: 'base', label: 'Escenario Base', speedFactor: 1, bunkerFactor: 1, portDelayDays: 0 },
        { key: 'stress', label: 'Escenario Estrés', speedFactor: 1, bunkerFactor: 1.05, portDelayDays: 2 }
    ]);

    function roundMoney(value) {
        return Math.round(toNumber(value) * 100) / 100;
    }

    function readCurrentFreightRevenue(baseResult = {}, documentRef = root.document) {
        const ownerBreakdown = baseResult.ownerNetBreakdown || {};
        const cargo = toNumber(baseResult.cargo);
        const freightRate = toNumber(baseResult.freightRate);
        const revenueExtras = toNumber(baseResult.cargoSurcharge);
        const currentFreightRevenue = (cargo * freightRate) + revenueExtras;

        if (currentFreightRevenue > 0) return currentFreightRevenue;

        if (documentRef) {
            const currentCargo = toNumber(documentRef.getElementById('cargo-qty')?.value);
            const currentFreightRate = toNumber(documentRef.getElementById('freight-rate')?.value);
            const currentRevenueExtras = toNumber(documentRef.getElementById('cargo-surcharge')?.value);
            const currentFormRevenue = (currentCargo * currentFreightRate) + currentRevenueExtras;
            if (currentFormRevenue > 0) return currentFormRevenue;
        }

        return Math.max(0, toNumber(ownerBreakdown.grossRevenue) || (cargo * freightRate));
    }

    function pickSensitivityBase(baseResult = {}) {
        const fuelBreakdown = baseResult.fuelBreakdown || {};
        const ownerBreakdown = baseResult.ownerNetBreakdown || {};
        const voyageFinancials = baseResult.voyageFinancials || {};
        const daysSea = Math.max(0, toNumber(baseResult.daysSea));
        const daysPort = Math.max(0, toNumber(baseResult.daysPort));
        const totalDays = Math.max(0, toNumber(baseResult.totalDays) || (daysSea + daysPort));
        const totalBunkers = Math.max(0, toNumber(baseResult.totalBunkers || fuelBreakdown.totalCost));
        const dailyOpex = Math.max(0, toNumber(baseResult.opex || baseResult.smartAdjustments?.opexDaily));
        const dailyCapex = Math.max(0, toNumber(baseResult.capexDaily || ownerBreakdown.capexDaily || baseResult.smartAdjustments?.capexDaily));
        const cargo = Math.max(0, toNumber(baseResult.cargo || voyageFinancials.cargoQty));
        const breakEven = Math.max(0, toNumber(baseResult.breakEvenArmador || voyageFinancials.breakEvenArmador || baseResult.breakEven));
        const loadRate = Math.max(0, toNumber(baseResult.loadRate));
        const dischargeRate = Math.max(0, toNumber(baseResult.dischRate));
        const calculatedPortOperationDays = cargo > 0
            ? ((loadRate > 0 ? cargo / loadRate : 0) + (dischargeRate > 0 ? cargo / dischargeRate : 0))
            : 0;
        const portOperationDays = calculatedPortOperationDays > 0
            ? Math.min(daysPort || calculatedPortOperationDays, calculatedPortOperationDays)
            : daysPort;
        const grossFreight = readCurrentFreightRevenue(baseResult);
        const knownVoyageCosts = Math.max(0, toNumber(ownerBreakdown.bunkerAndPortCosts));
        const knownOperatingCosts = Math.max(0, toNumber(ownerBreakdown.operatingCapitalCosts));
        const knownBaseCosts = knownVoyageCosts + knownOperatingCosts;
        const calculatedNetProfit = knownBaseCosts > 0
            ? grossFreight - knownBaseCosts
            : toNumber(baseResult.netProfitOwner ?? baseResult.beneficioNeto);

        return {
            ...baseResult,
            daysSea,
            daysPort,
            totalDays,
            totalBunkers,
            cargo,
            breakEven,
            portOperationDays,
            dailyOperatingCapitalCost: dailyOpex + dailyCapex,
            beneficioNeto: calculatedNetProfit,
            netProfitOwner: calculatedNetProfit,
            fleteBruto: grossFreight,
            fuelBreakdown
        };
    }

    function calculateSensitivityScenario(baseResult, scenario) {
        const base = pickSensitivityBase(baseResult);
        if (scenario.key === 'base') {
            return {
                ...base,
                key: scenario.key,
                label: scenario.label,
                projectedBreakEven: roundMoney(base.breakEven),
                breakEvenDelta: 0,
                savedPortDays: 0,
                addedPortDelayDays: 0,
                beneficioNeto: roundMoney(base.netProfitOwner),
                netProfitOwner: roundMoney(base.netProfitOwner),
                deltaBeneficio: 0,
                totalBunkers: roundMoney(base.totalBunkers),
                totalDays: roundMoney(base.totalDays),
                stressImpact: { bunkerDelta: 0, portDelayOperatingCost: 0, lostProfit: 0, total: 0, addedPortDelayDays: 0, offHireDays: 0 }
            };
        }

        const fuelBreakdown = base.fuelBreakdown || {};
        const navigationCost = Math.max(0, toNumber(fuelBreakdown.navigation?.cost));
        const portCost = Math.max(0, toNumber(fuelBreakdown.port?.cost));
        const anchorageCost = Math.max(0, toNumber(fuelBreakdown.anchorage?.cost)) + Math.max(0, toNumber(fuelBreakdown.anchorageAuxiliary?.cost));
        const knownFuelCost = navigationCost + portCost + anchorageCost;
        const totalFuelCost = knownFuelCost > 0 ? knownFuelCost : base.totalBunkers;
        const effectivePortCost = portCost > 0 ? portCost : (base.daysPort > 0 ? totalFuelCost * (base.daysPort / Math.max(1, base.totalDays)) : 0);
        const portBunkerDailyCost = base.daysPort > 0 ? effectivePortCost / base.daysPort : 0;
        const speedFactor = Math.max(1, toNumber(scenario.speedFactor) || 1);
        const savedPortDays = scenario.key === 'best'
            ? Math.max(0, base.portOperationDays - (base.portOperationDays / speedFactor))
            : 0;
        const addedPortDelayDays = Math.max(0, toNumber(scenario.portDelayDays));
        const adjustedPortFuelCost = Math.max(0, effectivePortCost - (savedPortDays * portBunkerDailyCost) + (addedPortDelayDays * portBunkerDailyCost));
        const bunkerFactor = Math.max(0, toNumber(scenario.bunkerFactor) || 1);
        const projectedBunkerCost = Math.max(0, ((totalFuelCost - effectivePortCost) + adjustedPortFuelCost) * bunkerFactor);
        const bunkerDelta = projectedBunkerCost - totalFuelCost;
        const dayDelta = addedPortDelayDays - savedPortDays;
        const operatingCostDelta = dayDelta * base.dailyOperatingCapitalCost;
        const totalCostDelta = bunkerDelta + operatingCostDelta;
        const projectedBreakEven = base.cargo > 0
            ? Math.max(0, base.breakEven + (totalCostDelta / base.cargo))
            : base.breakEven;
        const netProfitOwner = base.netProfitOwner - totalCostDelta;

        return {
            ...base,
            key: scenario.key,
            label: scenario.label,
            projectedBreakEven: roundMoney(projectedBreakEven),
            breakEvenDelta: roundMoney(projectedBreakEven - base.breakEven),
            savedPortDays: roundMoney(savedPortDays),
            addedPortDelayDays: roundMoney(addedPortDelayDays),
            beneficioNeto: roundMoney(netProfitOwner),
            netProfitOwner: roundMoney(netProfitOwner),
            deltaBeneficio: roundMoney(netProfitOwner - base.netProfitOwner),
            totalBunkers: roundMoney(projectedBunkerCost),
            totalDays: roundMoney(base.totalDays + dayDelta),
            stressImpact: {
                bunkerDelta: roundMoney(bunkerDelta),
                portDelayOperatingCost: roundMoney(operatingCostDelta),
                lostProfit: 0,
                demurrageExposure: 0,
                total: roundMoney(totalCostDelta),
                addedPortDelayDays: roundMoney(addedPortDelayDays),
                offHireDays: 0
            }
        };
    }

    function runSensitivityBatch(baseResult) {
        const scenarios = RISK_SCENARIOS.map((scenario) => calculateSensitivityScenario(baseResult, scenario));
        const best = scenarios.find((scenario) => scenario.key === 'best');
        const base = scenarios.find((scenario) => scenario.key === 'base');
        const stress = scenarios.find((scenario) => scenario.key === 'stress');
        return {
            best,
            base,
            stress,
            moderate: stress,
            critical: stress,
            scenarios,
            risk: evaluateRisk(base, stress, stress)
        };
    }

    function calculateRequiredFreight(moderateNetLoss, cargoQuantity) {
        const cargo = Math.max(0, toNumber(cargoQuantity));
        if (cargo <= 0) return 0;
        return Math.abs(toNumber(moderateNetLoss)) / cargo;
    }

    function analyzeStressFactor(baseCosts = {}, moderateCosts = {}) {
        const baseBunker = toNumber(baseCosts.totalBunkers ?? baseCosts.bunkerCost);
        const moderateBunker = toNumber(moderateCosts.totalBunkers ?? moderateCosts.bunkerCost);
        const bunkerIncrease = Math.max(0, moderateBunker - baseBunker);
        const stressImpact = moderateCosts.stressImpact || {};
        const daysDelayIncrease = Math.max(0, toNumber(stressImpact.portDelayOperatingCost) + toNumber(stressImpact.lostProfit));

        if (bunkerIncrease > daysDelayIncrease) {
            return 'El riesgo principal es la volatilidad del combustible. Recomendación: Añadir cláusula BAF (Bunker Adjustment Factor) en la póliza GENCON.';
        }

        return 'El riesgo principal son los retrasos en puerto. Recomendación: Aumentar el ritmo mínimo de carga/descarga o incluir cláusulas WIBON/WIPON y SHINC para proteger el Demurrage.';
    }

    function renderSmartAdvisor(batch, baseResult = {}, documentRef = root.document) {
        const panel = documentRef?.getElementById('smart-advisor-panel');
        if (!panel || !batch?.moderate) return;

        const moderateNetProfit = toNumber(batch.moderate.beneficioNeto ?? batch.moderate.netProfitOwner);
        const cargoQuantity = Math.max(
            0,
            toNumber(baseResult.cargo || baseResult.toneladas_carga || batch.moderate.cargo || documentRef.getElementById('cargo-qty')?.value)
        );

        if (moderateNetProfit > 0) {
            panel.classList.add('hidden');
            panel.innerHTML = '';
            return;
        }

        const suggestedFreight = calculateRequiredFreight(moderateNetProfit, cargoQuantity);
        const recommendation = analyzeStressFactor(batch.base, batch.moderate);
        const cargoLabel = cargoQuantity > 0
            ? `${cargoQuantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} MT`
            : 'carga no informada';

        panel.className = 'rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm no-print';
        panel.innerHTML = `
            <div class="flex flex-col gap-4 md:flex-row md:items-start">
                <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-white text-amber-600 shadow-sm">
                    <i class="fa-solid fa-lightbulb text-lg" aria-hidden="true"></i>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 class="text-sm font-black uppercase tracking-wide text-slate-900">Recomendaciones Activas</h2>
                            <p class="mt-1 text-xs font-semibold text-slate-600">Smart Advisor para escenario de estrés no viable.</p>
                        </div>
                        <span class="inline-flex w-fit items-center rounded-md border border-red-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase text-red-700">NO VIABLE</span>
                    </div>
                    <div class="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
                        <div class="rounded-lg border border-amber-200 bg-white p-3">
                            <div class="text-[10px] font-black uppercase text-slate-500">Ajuste de flete sugerido</div>
                            <div id="smart-advisor-freight" class="mt-1 mono text-2xl font-black text-slate-950">${moneyFormatter.format(suggestedFreight)}<span class="text-sm text-slate-500">/MT</span></div>
                            <div class="mt-1 text-[10px] font-semibold text-slate-500">Calculado sobre ${cargoLabel}</div>
                        </div>
                        <div class="rounded-lg border border-amber-200 bg-white p-3">
                            <div class="text-[10px] font-black uppercase text-slate-500">Recomendación contractual</div>
                            <p id="smart-advisor-recommendation" class="mt-1 text-xs font-bold leading-relaxed text-slate-800">${recommendation}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        panel.classList.remove('hidden');
    }

    function evaluateRisk(baseResult, moderateResult, criticalResult) {
        const fleteBruto = Math.max(0, toNumber(baseResult?.fleteBruto || moderateResult?.fleteBruto || criticalResult?.fleteBruto));
        const moderateProfit = toNumber(moderateResult?.beneficioNeto ?? moderateResult?.netProfitOwner);
        const marginRatio = fleteBruto > 0 ? moderateProfit / fleteBruto : 0;
        if (moderateProfit <= 0) {
            return {
                status: 'red',
                label: 'NO VIABLE',
                severity: 'blocking',
                blocksSave: true,
                message: 'El escenario de estrés entra en pérdida. Revise flete, bunker, días de puerto u OPEX antes de guardar la cotización.'
            };
        }
        if (marginRatio < 0.05) {
            return {
                status: 'yellow',
                label: 'MARGEN INSUFICIENTE',
                severity: 'warning',
                blocksSave: false,
                message: 'Margen insuficiente: el beneficio bajo estrés queda por debajo del 5% del flete bruto.'
            };
        }
        return {
            status: 'green',
            label: 'VIABLE',
            severity: 'ok',
            blocksSave: false,
            message: 'El escenario de estrés mantiene beneficio positivo con margen suficiente.'
        };
    }

    function readMarineForecast(baseResult = {}) {
        const forecast = baseResult.marineForecast || root.SeaCharterMarineForecast || {};
        const points = Array.isArray(forecast.points) ? forecast.points : [];
        const pointWaves = points.map((point) => toNumber(point?.waveHeight)).filter((value) => value > 0);
        const maxWaveHeight = Math.max(0, toNumber(forecast.maxWaveHeight), ...pointWaves);
        const podWaveHeight = Math.max(0, toNumber(forecast.podWaveHeight || points.at(-1)?.waveHeight));
        return {
            maxWaveHeight,
            podWaveHeight,
            weatherRiskDetected: maxWaveHeight > 2 || podWaveHeight > 2
        };
    }

    function calculateMeteoceanRisk({ draftVoyage, laytimeDays, demurrageRate } = {}) {
        const draft = draftVoyage && typeof draftVoyage === 'object'
            ? draftVoyage
            : (root.VoyageDraftStore?.getState?.()?.draft || {});
        const ports = draft?.weather?.ports || {};
        const normalizedLaytimeDays = Math.max(0, toNumber(laytimeDays));
        const normalizedDemurrageRate = Math.max(0, toNumber(demurrageRate));
        const risks = [];
        let maneuverBufferDays = 0;
        let operationalRiskDetected = false;

        ['pol', 'pod'].forEach((key) => {
            const weather = ports[key];
            if (!weather || typeof weather !== 'object') return;
            const role = toText(weather.role || key).toUpperCase();
            const portName = toText(weather.portName);
            const windKnots = Math.max(0, toNumber(weather.windKnots));
            const operationalStatus = normalizeText(weather.operationalStatus);
            const condition = normalizeText(weather.condition);
            const hasOperationalRisk = operationalStatus === 'RIESGO'
                || operationalStatus === 'LLUVIA'
                || condition === 'RIESGO'
                || condition === 'LLUVIA'
                || condition.includes('LLUVIA');

            if (windKnots > 25) {
                maneuverBufferDays += 0.5;
                risks.push({
                    type: 'wind',
                    role,
                    portName,
                    windKnots,
                    message: `Viento fuerte detectado en ${role}${portName ? ` · ${portName}` : ''} (${windKnots.toFixed(0)} kn)`,
                    addedDays: 0.5
                });
            }

            if (hasOperationalRisk) {
                operationalRiskDetected = true;
                risks.push({
                    type: 'operational',
                    role,
                    portName,
                    status: toText(weather.operationalStatus || weather.condition),
                    message: `${toText(weather.operationalStatus || weather.condition) || 'Riesgo operativo'} detectado en ${role}${portName ? ` · ${portName}` : ''}`,
                    addedDays: 0
                });
            }
        });

        const operationalBufferDays = operationalRiskDetected ? normalizedLaytimeDays * 0.20 : 0;
        const totalBufferDays = maneuverBufferDays + operationalBufferDays;
        const financialImpact = totalBufferDays * normalizedDemurrageRate;

        return {
            source: draft?.weather?.source || '',
            hasWeatherData: Boolean(ports.pol || ports.pod),
            hasRisk: totalBufferDays > 0,
            risks,
            laytimeDays: normalizedLaytimeDays,
            maneuverBufferDays,
            operationalBufferDays,
            totalBufferDays,
            demurrageRate: normalizedDemurrageRate,
            financialImpact
        };
    }

    function buildFixtureClauseAdvice(baseResult, forecast) {
        const pod = escapeHtml(baseResult.pod || 'POD no informado');
        const referenceWave = forecast.podWaveHeight || forecast.maxWaveHeight;
        if (forecast.weatherRiskDetected) {
            return `Riesgo climático detectado en POD (${pod})${referenceWave > 0 ? `, con oleaje previsto de hasta ${referenceWave.toFixed(1)} m` : ''}. Sugerencia: añadir cláusula WWD (Weather Working Days) estricta, protección WIPON/WIBON y BAF para absorber la variación del bunker.`;
        }
        return `Escenario preventivo para POD (${pod}): reservar +2 días por demora portuaria y +5% de bunker. Sugerencia: incorporar BAF y definir WWD/WIPON-WIBON antes de cerrar el Fixture Recap.`;
    }

    function renderAutomaticRiskMatrix(baseResult, documentRef = root.document) {
        if (!documentRef || !baseResult) return null;
        const currentFreightRevenue = readCurrentFreightRevenue(baseResult, documentRef);
        const hydratedBaseResult = {
            ...baseResult,
            ownerNetBreakdown: {
                ...(baseResult.ownerNetBreakdown || {}),
                grossRevenue: currentFreightRevenue
            }
        };
        const batch = runSensitivityBatch(hydratedBaseResult);
        const risk = batch.risk;
        const badge = documentRef.getElementById('auto-risk-status');
        const alert = documentRef.getElementById('auto-risk-alert');
        const tbody = documentRef.getElementById('risk-matrix-body');
        const tooltip = documentRef.getElementById('auto-risk-tooltip');
        const forecast = readMarineForecast(hydratedBaseResult);
        const meteoceanRisk = hydratedBaseResult.meteoceanRisk || calculateMeteoceanRisk({
            laytimeDays: hydratedBaseResult.smartAdjustments?.laytimeDays,
            demurrageRate: hydratedBaseResult.demurrage
        });
        batch.forecast = forecast;
        batch.meteoceanRisk = meteoceanRisk;
        const statusClasses = {
            green: 'rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-800',
            yellow: 'rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-800',
            red: 'rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-800'
        };

        if (badge) {
            badge.textContent = risk.label;
            badge.className = statusClasses[risk.status] || statusClasses.red;
            badge.title = risk.message;
        }
        if (tooltip) {
            tooltip.classList.toggle('hidden', risk.status !== 'yellow');
            tooltip.title = risk.message;
        }
        if (alert) {
            alert.textContent = risk.message;
            alert.className = risk.status === 'red'
                ? 'mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800'
                : (risk.status === 'yellow'
                    ? 'mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800'
                    : 'hidden');
        }
        if (tbody) {
            const bestBreakEven = toNumber(batch.best?.projectedBreakEven);
            const baseBreakEven = toNumber(batch.base?.projectedBreakEven);
            const stressBreakEven = toNumber(batch.stress?.projectedBreakEven);
            const thermometerRange = Math.max(0.01, stressBreakEven - bestBreakEven);
            const basePosition = Math.min(92, Math.max(8, ((baseBreakEven - bestBreakEven) / thermometerRange) * 100));
            const clauseAdvice = buildFixtureClauseAdvice(hydratedBaseResult, forecast);
            const meteoceanRiskItems = meteoceanRisk.risks.map((item) => `
                <li class="meteocean-impact__risk-item">
                    <i class="fa-solid ${item.type === 'wind' ? 'fa-wind' : 'fa-cloud-showers-heavy'}" aria-hidden="true"></i>
                    <span>${escapeHtml(item.message)}</span>
                </li>
            `).join('');
            const meteoceanContent = meteoceanRisk.hasRisk
                ? `
                    <ul class="meteocean-impact__risks">${meteoceanRiskItems}</ul>
                    <div class="meteocean-impact__metrics">
                        <div><span>Buffer de demora</span><strong>+${meteoceanRisk.totalBufferDays.toFixed(2)} días</strong></div>
                        <div><span>Impacto financiero</span><strong>${moneyFormatter.format(meteoceanRisk.financialImpact)}</strong></div>
                        <div><span>Tarifa aplicada</span><strong>${moneyFormatter.format(meteoceanRisk.demurrageRate)}/día</strong></div>
                    </div>
                `
                : `
                    <div class="meteocean-impact__empty">
                        <i class="fa-solid ${meteoceanRisk.hasWeatherData ? 'fa-circle-check' : 'fa-cloud-arrow-down'}" aria-hidden="true"></i>
                        <span>${meteoceanRisk.hasWeatherData ? 'Sin penalización climática según los umbrales operativos.' : 'Sin datos meteorológicos POL/POD en el DraftVoyage.'}</span>
                    </div>
                `;
            const scenarioCards = [
                {
                    scenario: batch.best,
                    variant: 'best',
                    eyebrow: 'Escenario Óptimo · Best Case',
                    formula: `+10% ritmo carga/descarga · -5% bunker`,
                    delta: `${batch.best.savedPortDays.toFixed(2)} días ahorrados · ${moneyFormatter.format(Math.abs(batch.best.breakEvenDelta))}/MT menos`
                },
                {
                    scenario: batch.base,
                    variant: 'base',
                    eyebrow: 'Escenario Base · Base Case',
                    formula: 'Datos validados actualmente · Break-even oficial',
                    delta: 'Punto central de negociación'
                },
                {
                    scenario: batch.stress,
                    variant: 'stress',
                    eyebrow: 'Escenario Estrés · Worst Case',
                    formula: `+2 días en puerto · +5% bunker${forecast.weatherRiskDetected ? ' · alerta de oleaje' : ''}`,
                    delta: `+${moneyFormatter.format(Math.max(0, batch.stress.breakEvenDelta))}/MT vs. base`
                }
            ];
            tbody.innerHTML = `
                <div class="sensitivity-scenario-grid">
                    ${scenarioCards.map(({ scenario, variant, eyebrow, formula, delta }) => `
                        <article class="sensitivity-card sensitivity-card--${variant}">
                            <div class="sensitivity-card__eyebrow"><span class="sensitivity-card__dot"></span>${eyebrow}</div>
                            <div class="sensitivity-card__value">${moneyFormatter.format(scenario.projectedBreakEven)}<span class="sensitivity-card__unit">/ MT</span></div>
                            <div class="sensitivity-card__formula">${formula}</div>
                            <div class="sensitivity-card__delta">${delta}</div>
                        </article>
                    `).join('')}
                </div>
                <section class="negotiation-thermometer" style="--base-position: ${basePosition.toFixed(2)}%" aria-label="Termómetro de negociación entre escenario óptimo y escenario de estrés">
                    <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <div class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Termómetro de negociación</div>
                            <div class="mt-1 text-xs font-bold text-slate-700">Posición actual frente al coste máximo proyectado</div>
                        </div>
                        <div class="font-mono text-xs font-black text-red-700">Exposición: +${moneyFormatter.format(Math.max(0, stressBreakEven - baseBreakEven))}/MT</div>
                    </div>
                    <div class="negotiation-thermometer__track"><span class="negotiation-thermometer__marker" aria-hidden="true"></span></div>
                    <div class="negotiation-thermometer__labels">
                        <span>Óptimo ${moneyFormatter.format(bestBreakEven)}</span>
                        <span>Base ${moneyFormatter.format(baseBreakEven)}</span>
                        <span>Estrés ${moneyFormatter.format(stressBreakEven)}</span>
                    </div>
                </section>
                <section class="meteocean-impact ${meteoceanRisk.hasRisk ? 'meteocean-impact--alert' : ''}" aria-label="Impacto Meteoceánico">
                    <div class="meteocean-impact__heading">
                        <div>
                            <span class="meteocean-impact__eyebrow">Buffer operativo automático</span>
                            <h3>Impacto Meteoceánico</h3>
                        </div>
                        <span class="meteocean-impact__badge">${meteoceanRisk.hasRisk ? 'Penalización activa' : 'Sin impacto'}</span>
                    </div>
                    ${meteoceanContent}
                </section>
                <aside class="fixture-clause-advice">
                    <span class="fixture-clause-advice__icon"><i class="fa-solid fa-file-signature" aria-hidden="true"></i></span>
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">Generador de cláusulas · Fixture Recap</div>
                        <p class="mt-1 text-xs font-bold leading-5">${clauseAdvice}</p>
                    </div>
                </aside>
            `;
        }
        renderSmartAdvisor(batch, hydratedBaseResult, documentRef);
        root.SeaCharterSensitivityAnalysis = batch;
        return batch;
    }

    class VoyageCostDomController {
        constructor(documentRef) {
            this.document = documentRef;
            this.isWriting = false;
            this.originalRunEngine = null;
        }

        el(id) {
            return this.document.getElementById(id);
        }

        readNumber(id) {
            return toNumber(this.el(id)?.value);
        }

        readPossiblyEstimatedNumber(id) {
            const element = this.el(id);
            if (!element) return 0;
            return element.dataset.autoEstimated === 'true' ? 0 : toNumber(element.value);
        }

        readTugUnitCost() {
            const element = this.el('t-remolcadores');
            if (!element || element.dataset.autoEstimated === 'true') return 0;
            return toNumber(element.dataset.tarifaBase) || toNumber(element.value);
        }

        readState() {
            const seaDays = toNumber((this.el('res-days-ballast')?.textContent || '').replace(/[^\d.-]/g, '')) +
                toNumber((this.el('res-days-laden')?.textContent || '').replace(/[^\d.-]/g, '')) +
                this.readNumber('factor-clima');
            const cargoTons = this.readNumber('cargo-qty');
            const metodoEstiba = toText(this.el('metodo_carga')?.value) || 'cinta_transportadora';
            const metodoDescarga = toText(this.el('metodo_descarga_pod')?.value) || metodoEstiba;
            const cranesPol = portMethodUsesCranes(metodoEstiba)
                ? (root.readNumeroGruasPuerto ? root.readNumeroGruasPuerto('pol') : Math.max(1, Math.floor(this.readNumber('ritmo_nominal_pol') || 1)))
                : 1;
            const cranesPod = portMethodUsesCranes(metodoDescarga)
                ? (root.readNumeroGruasPuerto ? root.readNumeroGruasPuerto('pod') : Math.max(1, Math.floor(this.readNumber('ritmo_nominal_pod') || 1)))
                : 1;
            const nominalPol = root.getRitmoBasePuerto ? root.getRitmoBasePuerto(metodoEstiba) : getRealPortRate(metodoEstiba);
            const nominalPod = root.getRitmoBasePuerto ? root.getRitmoBasePuerto(metodoDescarga) : getRealPortRate(metodoDescarga);
            const tipoCarga = toText(this.el('cargo-type')?.value);
            const suggestedPolRate = portMethodUsesCranes(metodoEstiba)
                ? (root.getRitmoRealPuerto ? root.getRitmoRealPuerto(metodoEstiba, nominalPol) : (nominalPol * getStowageMethodFactor(metodoEstiba))) * cranesPol
                : (root.getRitmoRealPuerto ? root.getRitmoRealPuerto(metodoEstiba, nominalPol) : (nominalPol * getStowageMethodFactor(metodoEstiba)));
            const suggestedPodRate = portMethodUsesCranes(metodoDescarga)
                ? (root.getRitmoRealPuerto ? root.getRitmoRealPuerto(metodoDescarga, nominalPod) : (nominalPod * getStowageMethodFactor(metodoDescarga))) * cranesPod
                : (root.getRitmoRealPuerto ? root.getRitmoRealPuerto(metodoDescarga, nominalPod) : (nominalPod * getStowageMethodFactor(metodoDescarga)));
            const realPolRate = this.readNumber('rate-load') || suggestedPolRate;
            const realPodRate = this.readNumber('rate-disch') || suggestedPodRate;
            const calculatePortDays = root.calcularDiasPuertoPorEstiba || ((tons, rate, method, craneCount) => calculatePortDaysByStowage(tons, method, rate, tipoCarga, craneCount));
            const portDays = calculatePortDays(cargoTons, realPolRate, metodoEstiba, cranesPol) + calculatePortDays(cargoTons, realPodRate, metodoDescarga, cranesPod);
            return {
                dias_navegacion: seaDays,
                dias_puerto: portDays,
                turn_time_hours: this.readNumber('turn-time-hours'),
                t_espera_fondeo: this.readNumber('t-fondeo'),
                delta_historico: this.readNumber('delta-historico'),
                pol_name: toText(this.el('port-pol')?.value),
                pod_name: toText(this.el('port-pod')?.value),
                nombre_buque: toText(this.el('nombre-buque-calculadora')?.value || this.el('vessel-name')?.value),
                toneladas_carga: cargoTons,
                tipo_carga: tipoCarga,
                factor_estiba: this.readNumber('cargo-sf'),
                capacidad_dwt: this.readNumber('vessel-dwt'),
                has_scrubber: Boolean(this.el('vessel-has-scrubber')?.checked),
                consumo_mar_td: this.readNumber('cons-sea'),
                precio_vlsfo: this.readNumber('price-sea'),
                precio_ifo380: this.readNumber('price-ifo'),
                consumo_puerto_td: this.readNumber('cons-port'),
                consumo_fondeo_td: this.readNumber('cons-anchorage'),
                consumo_auxiliar_fondeo_td: this.readNumber('cons-anchorage-aux') || 2.0,
                precio_mgo: this.readNumber('price-port'),
                opex_fijo_diario: this.readPossiblyEstimatedNumber('opex-daily'),
                pda_pol: this.readNumber('pda-pol'),
                pda_pod: this.readNumber('pda-pod'),
                estiba_terminal: this.readNumber('stevedoring-costs'),
                coste_trincaje: this.readNumber('input-trincaje'),
                coste_maniobra_especial: this.readNumber('coste-maniobra-especial'),
                dias_preparacion: this.readNumber('dias-preparacion'),
                comisiones_porcentaje: this.readNumber('comm-pct'),
                coste_remolcadores_ud: this.readTugUnitCost(),
                tonelaje_neto: this.readPossiblyEstimatedNumber('vessel-net-tonnage'),
                max_summer_draft: this.readNumber('vessel-draft'),
                calado_actual: this.readPossiblyEstimatedNumber('current-draft'),
                crane_swl_mt: this.readPossiblyEstimatedNumber('crane-swl-mt'),
                peso_pieza_mt: this.readNumber('peso-pieza-mt'),
                ciclos_hora_grua: this.readNumber('ciclos-hora-grua'),
                gruas_operativas_pol: cranesPol,
                gruas_operativas_pod: cranesPod,
                grab_capacity_cbm: this.readPossiblyEstimatedNumber('grab-capacity-cbm'),
                canal_seleccionado: toText(this.el('selected-canal')?.value) || 'Auto',
                charter_party_standard: toText(this.el('charter-party-standard')?.value) || 'GENCON'
            };
        }

        showDataAlert(message) {
            const alert = this.el('voyage-cost-data-alert');
            if (!alert) return;
            alert.textContent = message || 'Faltan datos operativos';
            alert.classList.toggle('hidden', !message);
        }

        renderCanal(canal) {
            const input = this.el('pda-misc');
            const canalValue = root.SeaCharterReactiveCostState?.result?.canal_efectivo || 'Ninguno';
            this.syncSelectedCanal(canalValue);
            if (!input) return;
            this.isWriting = true;
            input.value = toNumber(canal.extras_canal).toFixed(2);
            input.readOnly = canal.extras_canal > 0;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.classList.toggle('bg-sky-50', canal.extras_canal > 0);
            input.classList.toggle('border-sky-400', canal.extras_canal > 0);
            input.classList.toggle('text-blue-700', canal.extras_canal > 0);
            input.title = canal.extras_canal > 0
                ? `Calculado automáticamente por ${canalValue} (${canal.estado}${canal.war_risk_premium > 0 ? ', incluye War Risk' : ''})`
                : '';
            this.isWriting = false;
        }

        renderTugs(tugs) {
            const input = this.el('t-remolcadores');
            const container = this.el('contenedor_coste_remolcadores');
            if (!input && !container) return;
            const isInferred = Boolean(tugs.inferred);
            const tarifaBase = toNumber(tugs.tarifa_efectiva_ud || tugs.tarifa_base_ud);
            const totalTugs = toNumber(tugs.total_usos_remolcador);
            const costeTotal = toNumber(tugs.coste_total_tugs);
            this.isWriting = true;
            if (input) {
                input.value = costeTotal.toFixed(0);
                input.dataset.tarifaBase = tarifaBase.toFixed(0);
                input.dataset.totalTugs = String(totalTugs);
                input.dataset.tugsPorManiobra = String(toNumber(tugs.tugs_por_maniobra));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (input) {
                if (isInferred) {
                    input.dataset.autoEstimated = 'true';
                } else if (input.dataset.autoEstimated === 'true') {
                    delete input.dataset.autoEstimated;
                }
            }
            if (container) {
                container.innerHTML = `
                    <span class="base text-sm">$${tarifaBase.toLocaleString('en-US')} (Base)</span> x
                    <span class="multiplicador text-sm">${totalTugs.toLocaleString('en-US')} (Total Tugs)</span> =
                    <span class="total font-bold text-blue-700">$${costeTotal.toLocaleString('en-US')}</span>
                `;
                container.title = `Tarifa por remolcador: ${toNumber(tugs.tugs_por_maniobra)} remolcador(es) por maniobra x 4 maniobras`;
                container.classList.toggle('border-sky-400', isInferred);
            }
            this.isWriting = false;
        }

        syncSelectedCanal(canalValue) {
            const select = this.el('selected-canal');
            if (!select) return;
            select.classList.add('text-blue-700');
            select.title = 'Canal deducido automaticamente por Core PRO a partir de POL/POD';
            this.isWriting = true;
            try {
                select.value = canalValue;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            } finally {
                this.isWriting = false;
            }
        }

        renderFallbacks(fallbacks) {
            const mapping = {
                tonelaje_neto: { id: 'vessel-net-tonnage', decimals: 0 },
                calado_actual: { id: 'current-draft', decimals: 2 },
                crane_swl_mt: { id: 'crane-swl-mt', decimals: 1 },
                grab_capacity_cbm: { id: 'grab-capacity-cbm', decimals: 1 },
                opex_fijo_diario: { id: 'opex-daily', decimals: 0 },
                estiba_terminal: { id: 'stevedoring-costs', decimals: 2 }
            };
            const usedKeys = Object.keys(fallbacks || {});
            Object.entries(mapping).forEach(([key, config]) => {
                const input = this.el(config.id);
                if (!input) return;
                const isEstimated = usedKeys.includes(key);
                if (isEstimated) {
                    this.isWriting = true;
                    const nextVal = toNumber(fallbacks[key]).toFixed(config.decimals);
                    if (input.value !== nextVal) {
                        input.value = nextVal;
                    }
                    input.readOnly = true;
                    input.dataset.autoEstimated = 'true';
                    this.isWriting = false;
                } else if (input.dataset.autoEstimated === 'true') {
                    input.readOnly = false;
                    delete input.dataset.autoEstimated;
                }
                input.classList.toggle('bg-white', isEstimated);
                input.classList.toggle('border-sky-400', isEstimated);
                input.classList.toggle('text-blue-700', isEstimated);
                input.title = isEstimated ? 'Valor estimado por SeaCharter Core PRO basado en DWT' : '';
            });

            const opexBadge = this.el('opex-auto-estimated-badge');
            if (opexBadge) {
                const estimatedOpex = usedKeys.includes('opex_fijo_diario');
                opexBadge.classList.toggle('hidden', !estimatedOpex);
                opexBadge.textContent = estimatedOpex
                    ? `Autocalculado por IA: media de mercado ${moneyFormatter.format(fallbacks.opex_fijo_diario)} / dia para este DWT.`
                    : '';
            }

            const note = this.el('vessel-specs-inference-note');
            if (!note) return;
            note.classList.toggle('hidden', usedKeys.length === 0);
            note.textContent = usedKeys.length > 0
                ? 'Valores estimados por IA basados en DWT. Se usan solo para este cálculo y no sustituyen la ficha técnica del buque.'
                : '';
        }

        renderCraneAlert(cranes) {
            const alert = this.el('crane-validation-alert');
            if (!alert) return;
            alert.classList.remove('hidden', 'border-red-300', 'bg-red-50', 'text-red-800', 'border-emerald-300', 'bg-emerald-50', 'text-emerald-800');
            if (cranes.missing_piece_inputs) {
                alert.classList.add('border-red-300', 'bg-red-50', 'text-red-800');
                alert.textContent = 'RIESGO ALTO: define Peso por pieza y Ciclos/hora para calcular Hierro/Acero.';
            } else if (cranes.piece_overload) {
                const swl = toNumber(root.document?.getElementById('crane-swl-mt')?.value);
                alert.classList.add('border-red-300', 'bg-red-50', 'text-red-800');
                alert.textContent = `RIESGO ALTO: Excede SWL. Peso por pieza ${cranes.peso_pieza_mt.toFixed(2)} MT > Crane SWL ${swl.toFixed(2)} MT.`;
            } else if (cranes.overload) {
                alert.classList.add('border-red-300', 'bg-red-50', 'text-red-800');
                alert.textContent = `ALERTA CRITICA: sobrecarga de grua. Izado estimado ${cranes.peso_total_izado.toFixed(2)} MT por ciclo.`;
            } else {
                alert.classList.add('border-emerald-300', 'bg-emerald-50', 'text-emerald-800');
                alert.textContent = `Gruas OK: izado estimado ${cranes.peso_total_izado.toFixed(2)} MT por ciclo.`;
            }
        }

        renderTotals(result) {
            const totalEl = this.el('res-cost-total');
            const breakEvenEl = this.el('res-breakeven');
            if (totalEl) totalEl.textContent = moneyFormatter.format(result.coste_total_viaje);
            if (breakEvenEl) breakEvenEl.textContent = moneyFormatter.format(result.break_even);
        }

        recalculate(options = {}) {
            if (this.isWriting) return null;
            try {
                const state = this.readState();
                if (state.capacidad_dwt <= 0 && (state.tonelaje_neto <= 0 || state.calado_actual <= 0 || state.crane_swl_mt <= 0)) {
                    this.showDataAlert('Faltan datos operativos: DWT requerido para estimar specs tecnicas.');
                } else {
                    this.showDataAlert('');
                }
                const result = calculateVoyageCostState(state);
                root.SeaCharterReactiveCostState = Object.freeze({ state: result.state, result });
                this.renderFallbacks(result.fallbacks);
                this.renderCanal(result.canal);
                this.renderTugs(result.tugs);
                this.renderCraneAlert(result.cranes);
                if (options.renderTotals) this.renderTotals(result);
                return result;
            } catch (error) {
                console.error('Error en motor Core PRO:', error);
                this.showDataAlert('Faltan datos operativos');
                return null;
            }
        }

        bindDelegatedListener() {
            const container = this.document.getElementById('view-estimator') || this.document.body;
            if (!container || container.dataset.voyageCostDelegated === 'true') return;
            container.dataset.voyageCostDelegated = 'true';
            container.addEventListener('input', (event) => {
                if (this.isWriting || event.target?.id !== 't-remolcadores') return;
                delete event.target.dataset.autoEstimated;
            }, true);
            const handler = (event) => {
                if (this.isWriting) return;
                if (!event.target || !event.target.matches('input, select, textarea')) return;
                this.recalculate({ renderTotals: false });
            };
            container.addEventListener('input', handler);
            container.addEventListener('change', handler);
        }

        bindRouteListeners() {
            ['port-pol', 'port-pod'].forEach((id) => {
                const input = this.el(id);
                if (!input || input.dataset.voyageRouteListener === 'true') return;
                input.dataset.voyageRouteListener = 'true';
                input.addEventListener('input', () => this.recalculate({ renderTotals: false }));
                input.addEventListener('blur', () => this.recalculate({ renderTotals: false }));
            });
        }

        wrapRunEngine() {
            if (typeof root.runEngine !== 'function' || root.runEngine.__voyageCostWrapped) return;
            this.originalRunEngine = root.runEngine;
            const controller = this;
            root.runEngine = function wrappedRunEngine() {
                const result = controller.originalRunEngine.apply(this, arguments);
                controller.recalculate({ renderTotals: true });
                return result;
            };
            root.runEngine.__voyageCostWrapped = true;
        }

        init() {
            this.bindDelegatedListener();
            this.bindRouteListeners();
            this.wrapRunEngine();
            this.recalculate({ renderTotals: false });
        }
    }

    const defaultDSSState = {
        ballastDays: 0,
        jwlaRiskActive: false,
        jwlaPremiumUSD: 0,
        actualCargoIntake: 50000,
        targetCargoMT: 50000,
        cargoQty: 50000,
        ladenDays: 8,
        seaDays: 8,
        estimatedVoyageDays: 8,
        totalBunkerCost: 0,
        totalPortDisbursements: 0,
        pol: 'Rotterdam',
        pod: 'Houston',
        vesselName: 'Vessel Reference',
        freightRateUSD: 35,
        fleteEstimado: 35,
        fleteUnitario: 35
    };

    function calculateMarketFreightWithRisk(dssState, globalMarketTCE) {
        const safeIntake = (dssState && Number(dssState.actualCargoIntake) > 0)
            ? Number(dssState.actualCargoIntake)
            : (Number(dssState?.targetCargoMT || dssState?.cargoQty || dssState?.cargo) || 1);
        const safeBallast = Number(dssState?.ballastDays) || 0;
        const safeJWLA = dssState?.jwlaRiskActive ? (Number(dssState?.jwlaPremiumUSD) || 0) : 0;

        const safeLadenDays = Number(dssState?.ladenDays ?? dssState?.seaDays ?? dssState?.estimatedVoyageDays ?? 0) || 0;
        const totalBillableDays = safeLadenDays + safeBallast;

        const safeBunker = Number(dssState?.totalBunkerCost ?? dssState?.bunkerCost ?? 0) || 0;
        const safePort = Number(dssState?.totalPortDisbursements ?? dssState?.portDisbursements ?? dssState?.portCosts ?? 0) || 0;
        const totalDirectCosts = safeBunker + safePort;

        const safeMarketTCE = Number(globalMarketTCE) || 0;
        const totalVoyageCost = (totalBillableDays * safeMarketTCE) + totalDirectCosts + safeJWLA;

        return totalVoyageCost / safeIntake;
    }

    function handleCommitConditions(currentState, executeSafeCommit) {
        const targetIntake = Number(currentState?.actualCargoIntake || currentState?.targetCargoMT || currentState?.cargoQty || currentState?.cargo) || 50000;
        const ballastDays = Number(currentState?.ballastDays) || 0;
        const jwlaRiskActive = Boolean(currentState?.jwlaRiskActive);
        const jwlaPremiumUSD = Number(currentState?.jwlaPremiumUSD) || 0;
        const vesselName = String(currentState?.vesselName || currentState?.vessel || 'Vessel Reference').trim();
        const freightRateUSD = Number(currentState?.freightRateUSD || currentState?.fleteEstimado || currentState?.fleteUnitario) || 35;

        if (ballastDays < 0 || jwlaPremiumUSD < 0 || targetIntake <= 0 || !vesselName || freightRateUSD <= 0 || Number.isNaN(targetIntake) || Number.isNaN(freightRateUSD)) {
            console.error("Error de validación pre-PDF: datos inválidos en el estado");
            return false;
        }

        const validData = {
            ballastDays,
            jwlaRiskActive,
            jwlaPremiumUSD,
            actualCargoIntake: targetIntake,
            vesselName,
            freightRateUSD
        };

        if (typeof executeSafeCommit === 'function') {
            executeSafeCommit(validData);
        }
        return true;
    }

    const api = {
        toNumber,
        calculateBunkers,
        calculateOpex,
        defaultDSSState,
        calculateMarketFreightWithRisk,
        handleCommitConditions,
        detectEffectiveCanal,
        estimateNetTonnage,
        estimateMaxSummerDraft,
        estimateBallastDraft,
        estimateDraft,
        estimateCraneSwl,
        estimateGrabCapacity,
        estimateDailyOpexByDwt,
        inferTugCostByDwt,
        applyTechnicalFallbacks,
        calculateCanalToll,
        validateCranes,
        calculateTotals,
        calculateWarRiskPremium,
        calculateTurnTimeDays,
        normalizeCargoType,
        RITMOS_BASE_PUERTO,
        FACTORES_ESTIBA,
        SMART_LOADING_BASE_RATE_PER_DAY,
        SMART_LOADING_INTERFERENCE_FACTORS,
        PASSIVE_PORT_METHODS,
        ISLAMIC_WEEKEND_COUNTRIES,
        calculateOperationalRisk,
        updateExecutiveDashboard,
        BIG_BAGS_PORT_CRANE,
        isBigBagsPortCraneMethod,
        getBigBagsPortCraneLiftCapacityMt,
        getBigBagsPortCraneEfficiencyPct,
        calculateBigBagsPortCraneDailyRate,
        getStowageMethodFactor,
        getRealPortRate,
        portMethodUsesCranes,
        calculatePortDaysByStowage,
        calculateRealLoadRate,
        calculateDemurrageExposure,
        shouldAutoEstimateStevedoring,
        estimateStevedoringTerminal,
        calculateVoyageCostState,
        DEFAULT_LUMPSUM_TARGET_BASE_MT,
        resolveFreightBase,
        calculateVoyageFinancials,
        RISK_SCENARIOS,
        calculateSensitivityScenario,
        runSensitivityBatch,
        calculateRequiredFreight,
        analyzeStressFactor,
        renderSmartAdvisor,
        evaluateRisk,
        calculateMeteoceanRisk,
        renderAutomaticRiskMatrix,
        VoyageCostDomController
    };

    root.SeaCharterVoyageCostEngine = api;
    root.ISLAMIC_WEEKEND_COUNTRIES = ISLAMIC_WEEKEND_COUNTRIES;
    root.calculateOperationalRisk = calculateOperationalRisk;
    root.updateExecutiveDashboard = updateExecutiveDashboard;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    function initWhenReady() {
        const controller = new VoyageCostDomController(root.document);
        root.SeaCharterVoyageCostController = controller;
        controller.init();
    }

    if (root.document) {
        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', initWhenReady);
        } else {
            initWhenReady();
        }
    }
}(typeof window !== 'undefined' ? window : globalThis));
