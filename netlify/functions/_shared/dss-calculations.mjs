// Mathematical tool only. Commercial judgment belongs to MADRE.
export function calcularDss(ui = {}) {
  const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const cargo = positive(ui.cargoQty);
  const breakEven = positive(ui.breakEvenUnitario ?? ui.breakEven);
  const freight = positive(ui.fleteUnitario ?? ui.freightSell);
  const floor = positive(ui.allInRateGross);
  const load = positive(ui.loadRate);
  const discharge = positive(ui.dischargeRate);
  return {
    source: 'cerebro-ia', tool: 'delegar_cerebro_ia',
    cargo_mt: cargo, break_even_usd_mt: breakEven, freight_usd_mt: freight,
    all_in_gross_usd_mt: floor,
    margin_pct: freight && breakEven ? (freight - breakEven) / freight * 100 : null,
    loading_days: cargo && load ? cargo / load : null,
    discharge_days: cargo && discharge ? cargo / discharge : null,
    riesgos_base: {
      below_break_even: freight && breakEven ? freight < breakEven : null,
      discharge_below_2500_mt_day: discharge ? discharge < 2500 : null,
      jwla_active: Boolean(ui.jwlaRiskActive),
    },
    missing_fields: Object.entries({ cargoQty: cargo, breakEvenUnitario: breakEven, fleteUnitario: freight, allInRateGross: floor })
      .filter(([, value]) => value === null).map(([key]) => key),
  };
}
