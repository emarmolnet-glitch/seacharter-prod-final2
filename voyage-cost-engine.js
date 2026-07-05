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

    const RITMOS_BASE_PUERTO = {
        cinta_transportadora: 2500,
        camion_tolva: 1500,
        cuchara_grab: 1200,
        grua_portuaria_30mt: 1200,
        big_bags: 1100,
        paletizado: 1000,
        hierro_acero_piezas: 1000
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

    function normalizeText(value) {
        return toText(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
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
        return Math.ceil(cargo / rate);
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
        effectiveState.turn_time_days = calculateTurnTimeDays(effectiveState.charter_party_standard);
        const cargoKind = normalizeCargoType(effectiveState.tipo_carga);
        effectiveState.dias_puerto_total = toNumber(effectiveState.dias_puerto) +
            effectiveState.turn_time_days +
            (cargoKind === 'proyecto' ? toNumber(effectiveState.dias_preparacion) : 0) +
            toNumber(effectiveState.t_espera_fondeo) +
            toNumber(effectiveState.delta_historico);
        const canal = calculateCanalToll(effectiveState);
        const cranes = validateCranes(effectiveState);
        const tugs = inferTugCostByDwt(effectiveState.capacidad_dwt, state.coste_remolcadores_ud);
        const totals = calculateTotals(effectiveState, canal.extras_canal, tugs.coste_total_tugs);
        return { ...totals, canal, cranes, tugs, fallbacks: fallbackResult.fallbacks, canal_efectivo: fallbackResult.canal_efectivo, state: effectiveState };
    }

    const RISK_SCENARIOS = Object.freeze([
        { key: 'base', label: 'Base', bunkerVolatility: 0, portDelayFactor: 1, offHireDays: 0 },
        { key: 'moderate', label: 'Moderado', bunkerVolatility: 0.10, portDelayFactor: 1.2, offHireDays: 1 },
        { key: 'critical', label: 'Critico', bunkerVolatility: 0.25, portDelayFactor: 1.5, offHireDays: 3 }
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
        const daysSea = Math.max(0, toNumber(baseResult.daysSea));
        const daysPort = Math.max(0, toNumber(baseResult.daysPort));
        const totalDays = Math.max(0, toNumber(baseResult.totalDays) || (daysSea + daysPort));
        const totalBunkers = Math.max(0, toNumber(baseResult.totalBunkers || fuelBreakdown.totalCost));
        const dailyOpex = Math.max(0, toNumber(baseResult.opex || baseResult.smartAdjustments?.opexDaily));
        const dailyCapex = Math.max(0, toNumber(baseResult.capexDaily || ownerBreakdown.capexDaily || baseResult.smartAdjustments?.capexDaily));
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
                beneficioNeto: roundMoney(base.netProfitOwner),
                netProfitOwner: roundMoney(base.netProfitOwner),
                deltaBeneficio: 0,
                totalBunkers: roundMoney(base.totalBunkers),
                totalDays: roundMoney(base.totalDays),
                stressImpact: { bunkerDelta: 0, portDelayOperatingCost: 0, lostProfit: 0, total: 0, addedPortDelayDays: 0, offHireDays: 0 }
            };
        }

        const volatilityFactor = 1 + Math.max(0, toNumber(scenario.bunkerVolatility));
        const portDelayFactor = Math.max(1, toNumber(scenario.portDelayFactor, 1));
        const fuelBreakdown = base.fuelBreakdown || {};
        const navigationCost = Math.max(0, toNumber(fuelBreakdown.navigation?.cost));
        const portCost = Math.max(0, toNumber(fuelBreakdown.port?.cost));
        const anchorageCost = Math.max(0, toNumber(fuelBreakdown.anchorage?.cost)) + Math.max(0, toNumber(fuelBreakdown.anchorageAuxiliary?.cost));
        const knownFuelCost = navigationCost + portCost + anchorageCost;
        const totalFuelCost = knownFuelCost > 0 ? knownFuelCost : base.totalBunkers;
        const effectivePortCost = portCost > 0 ? portCost : Math.max(0, totalFuelCost - navigationCost - anchorageCost);
        const stressedFuelCost = ((navigationCost + anchorageCost) + (effectivePortCost * portDelayFactor)) * volatilityFactor;
        const bunkerDelta = stressedFuelCost - totalFuelCost;
        const stressedPortDays = base.daysPort * portDelayFactor;
        const addedPortDelayDays = Math.max(0, stressedPortDays - base.daysPort);
        const offHireDays = Math.max(0, toNumber(scenario.offHireDays));
        const portDelayOperatingCost = addedPortDelayDays * base.dailyOperatingCapitalCost;
        const lostProfit = offHireDays * base.dailyOperatingCapitalCost;
        const totalStressImpact = bunkerDelta + portDelayOperatingCost + lostProfit;
        const netProfitOwner = base.netProfitOwner - totalStressImpact;

        return {
            ...base,
            key: scenario.key,
            label: scenario.label,
            beneficioNeto: roundMoney(netProfitOwner),
            netProfitOwner: roundMoney(netProfitOwner),
            deltaBeneficio: roundMoney(netProfitOwner - base.netProfitOwner),
            totalBunkers: roundMoney(stressedFuelCost),
            totalDays: roundMoney(base.daysSea + stressedPortDays + offHireDays),
            stressImpact: {
                bunkerDelta: roundMoney(bunkerDelta),
                portDelayOperatingCost: roundMoney(portDelayOperatingCost),
                lostProfit: roundMoney(lostProfit),
                total: roundMoney(totalStressImpact),
                addedPortDelayDays: roundMoney(addedPortDelayDays),
                offHireDays: roundMoney(offHireDays)
            }
        };
    }

    function runSensitivityBatch(baseResult) {
        const scenarios = RISK_SCENARIOS.map((scenario) => calculateSensitivityScenario(baseResult, scenario));
        const [base, moderate, critical] = scenarios;
        return {
            base,
            moderate,
            critical,
            scenarios,
            risk: evaluateRisk(base, moderate, critical)
        };
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
                message: 'Escenario moderado en perdida. Revise flete, bunker, dias de puerto u OPEX antes de guardar la cotizacion.'
            };
        }
        if (marginRatio < 0.05) {
            return {
                status: 'yellow',
                label: 'MARGEN INSUFICIENTE',
                severity: 'warning',
                blocksSave: false,
                message: 'Margen insuficiente: el beneficio moderado queda por debajo del 5% del flete bruto.'
            };
        }
        return {
            status: 'green',
            label: 'VIABLE',
            severity: 'ok',
            blocksSave: false,
            message: 'El escenario moderado mantiene beneficio positivo con margen suficiente.'
        };
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
        const statusClasses = {
            green: 'rounded-md border border-emerald-500/50 bg-emerald-950/50 px-2 py-1 text-[10px] font-black uppercase text-emerald-200',
            yellow: 'rounded-md border border-amber-500/50 bg-amber-950/50 px-2 py-1 text-[10px] font-black uppercase text-amber-200',
            red: 'rounded-md border border-red-500/60 bg-red-950/50 px-2 py-1 text-[10px] font-black uppercase text-red-200'
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
                ? 'mt-3 rounded-lg border border-red-500/50 bg-red-950/45 px-3 py-2 text-xs font-bold text-red-100'
                : (risk.status === 'yellow'
                    ? 'mt-3 rounded-lg border border-amber-500/45 bg-amber-950/35 px-3 py-2 text-xs font-bold text-amber-100'
                    : 'hidden');
        }
        if (tbody) {
            tbody.innerHTML = batch.scenarios.map((scenario) => {
                const profitClass = scenario.beneficioNeto >= 0 ? 'text-emerald-300' : 'text-red-300';
                const deltaClass = scenario.deltaBeneficio >= 0 ? 'text-emerald-300' : 'text-red-300';
                return `
                    <tr class="border-t border-slate-800">
                        <td class="py-2 pr-3 font-black text-slate-200">${scenario.label}</td>
                        <td class="px-3 py-2 text-right mono text-slate-300">${moneyFormatter.format(scenario.totalBunkers)}</td>
                        <td class="px-3 py-2 text-right mono text-slate-300">${toNumber(scenario.totalDays).toFixed(1)} d</td>
                        <td class="px-3 py-2 text-right mono ${profitClass}">${moneyFormatter.format(scenario.beneficioNeto)}</td>
                        <td class="py-2 pl-3 text-right mono ${deltaClass}">${moneyFormatter.format(scenario.deltaBeneficio)}</td>
                    </tr>
                `;
            }).join('');
        }
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
                    input.value = toNumber(fallbacks[key]).toFixed(config.decimals);
                    input.readOnly = true;
                    input.dataset.autoEstimated = 'true';
                    input.dispatchEvent(new Event('change', { bubbles: true }));
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
                controller.recalculate({ renderTotals: false });
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

    const api = {
        toNumber,
        calculateBunkers,
        calculateOpex,
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
        PASSIVE_PORT_METHODS,
        getStowageMethodFactor,
        getRealPortRate,
        portMethodUsesCranes,
        calculatePortDaysByStowage,
        shouldAutoEstimateStevedoring,
        estimateStevedoringTerminal,
        calculateVoyageCostState,
        RISK_SCENARIOS,
        calculateSensitivityScenario,
        runSensitivityBatch,
        evaluateRisk,
        renderAutomaticRiskMatrix,
        VoyageCostDomController
    };

    root.SeaCharterVoyageCostEngine = api;

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
