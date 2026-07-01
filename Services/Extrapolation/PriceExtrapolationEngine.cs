using System;
using System.Collections.Generic;
using System.Linq;
using SeaCharter.DTOs.Extrapolation;
using SeaCharter.Models.Extrapolation;

namespace SeaCharter.Services.Extrapolation
{
    /// <summary>
    /// Motor de extrapolacion de precios para convertir matrices historicas de Excel a valores actuales.
    /// </summary>
    public class PriceExtrapolationEngine
    {
        private const decimal HighRiskThreshold = 0.50m;
        private readonly MarketVariables _marketVariables;

        public PriceExtrapolationEngine(MarketVariables marketVariables)
        {
            _marketVariables = marketVariables ?? throw new ArgumentNullException(nameof(marketVariables));
        }

        /// <summary>
        /// Extrapola una tarifa historica usando las variables actuales configuradas en MarketVariables.
        /// Alimentacion desde Excel: mapear la columna de flete base a historicalBaseRate,
        /// la columna BAF a historicalBaf y el tipo EUR/USD del periodo historico a historicalFxRate.
        /// </summary>
        public ExtrapolatedFreightRate ExtrapolateFreight(
            decimal historicalBaseRate,
            decimal historicalBaf,
            decimal historicalFxRate)
        {
            return ExtrapolateFreight(
                historicalBaseRate,
                historicalBaf,
                historicalFxRate,
                historicalLocalCharges: 0m,
                historicalBunkerPrice: _marketVariables.HistoricalBunkerPrice);
        }

        /// <summary>
        /// Extrapola una fila con gastos locales cuando el Excel contiene conceptos como THC, despacho o documentacion.
        /// </summary>
        public ExtrapolatedFreightRate ExtrapolateFreight(
            decimal historicalBaseRate,
            decimal historicalBaf,
            decimal historicalFxRate,
            decimal historicalLocalCharges,
            decimal historicalBunkerPrice)
        {
            ValidateHistoricalInputs(historicalBaseRate, historicalBaf, historicalFxRate, historicalLocalCharges, historicalBunkerPrice);

            decimal fxAdjustmentFactor = _marketVariables.CurrentFxRate / historicalFxRate;
            decimal bunkerAdjustmentFactor = _marketVariables.CurrentBunkerPrice / historicalBunkerPrice;
            decimal localInflationFactor = 1m + _marketVariables.InflationIndex;

            decimal adjustedBaseRate = historicalBaseRate * fxAdjustmentFactor;
            decimal adjustedBaf = historicalBaf * bunkerAdjustmentFactor;
            decimal adjustedLocalCharges = historicalLocalCharges * localInflationFactor;

            return new ExtrapolatedFreightRate
            {
                AdjustedBaseRate = adjustedBaseRate,
                AdjustedBaf = adjustedBaf,
                AdjustedLocalCharges = adjustedLocalCharges,
                TotalAdjustedRate = adjustedBaseRate + adjustedBaf + adjustedLocalCharges,
                FxAdjustmentFactor = fxAdjustmentFactor,
                BunkerAdjustmentFactor = bunkerAdjustmentFactor,
                LocalInflationFactor = localInflationFactor,
                IsHighRiskEstimate =
                    IsExtremeVariation(fxAdjustmentFactor) ||
                    IsExtremeVariation(bunkerAdjustmentFactor) ||
                    IsExtremeVariation(localInflationFactor)
            };
        }

        /// <summary>
        /// Recibe la matriz historica ya parseada desde Excel/CSV y devuelve la misma matriz ajustada a valor actual.
        /// Cada fila del Excel debe normalizarse primero a HistoricalFreightRate para mantener separadas
        /// la lectura del archivo, las validaciones de datos y la matematica de extrapolacion.
        /// </summary>
        public IReadOnlyList<ExtrapolatedFreightRate> ExtrapolateFreightRates(IEnumerable<HistoricalFreightRate> historicalRates)
        {
            if (historicalRates == null)
            {
                throw new ArgumentNullException(nameof(historicalRates));
            }

            return historicalRates.Select(rate =>
            {
                if (rate == null)
                {
                    throw new ArgumentException("La matriz historica contiene una fila nula.", nameof(historicalRates));
                }

                ExtrapolatedFreightRate result = ExtrapolateFreight(
                    rate.HistoricalBaseRate,
                    rate.HistoricalBaf,
                    rate.HistoricalFxRate,
                    rate.HistoricalLocalCharges,
                    rate.HistoricalBunkerPrice ?? _marketVariables.HistoricalBunkerPrice);

                result.ReferenceCode = rate.ReferenceCode;
                result.PortOfLoading = rate.PortOfLoading;
                result.PortOfDischarge = rate.PortOfDischarge;
                result.EquipmentType = rate.EquipmentType;
                result.HistoricalValidityDate = rate.HistoricalValidityDate;

                return result;
            }).ToList();
        }

        private static bool IsExtremeVariation(decimal factor)
        {
            return Math.Abs(factor - 1m) > HighRiskThreshold;
        }

        private static void ValidateHistoricalInputs(
            decimal historicalBaseRate,
            decimal historicalBaf,
            decimal historicalFxRate,
            decimal historicalLocalCharges,
            decimal historicalBunkerPrice)
        {
            if (historicalBaseRate < 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(historicalBaseRate), "El flete base historico no puede ser negativo.");
            }

            if (historicalBaf < 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(historicalBaf), "El BAF historico no puede ser negativo.");
            }

            if (historicalFxRate <= 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(historicalFxRate), "El tipo de cambio historico debe ser mayor que cero.");
            }

            if (historicalLocalCharges < 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(historicalLocalCharges), "Los gastos locales historicos no pueden ser negativos.");
            }

            if (historicalBunkerPrice <= 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(historicalBunkerPrice), "El precio historico de bunker debe ser mayor que cero.");
            }
        }
    }
}
