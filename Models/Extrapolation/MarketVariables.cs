using System;

namespace SeaCharter.Models.Extrapolation
{
    /// <summary>
    /// Variables de mercado que se actualizan desde fuentes externas sin tocar la logica matematica central.
    /// </summary>
    public class MarketVariables
    {
        public MarketVariables(
            decimal currentBunkerPrice,
            decimal currentFxRate,
            decimal inflationIndex,
            decimal historicalBunkerPrice)
        {
            if (currentBunkerPrice <= 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(currentBunkerPrice), "El precio actual de combustible debe ser mayor que cero.");
            }

            if (currentFxRate <= 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(currentFxRate), "El tipo de cambio actual debe ser mayor que cero.");
            }

            if (inflationIndex < -1m)
            {
                throw new ArgumentOutOfRangeException(nameof(inflationIndex), "El indice de inflacion no puede reducir el importe por debajo de cero.");
            }

            if (historicalBunkerPrice <= 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(historicalBunkerPrice), "El precio historico de combustible debe ser mayor que cero.");
            }

            CurrentBunkerPrice = currentBunkerPrice;
            CurrentFxRate = currentFxRate;
            InflationIndex = inflationIndex;
            HistoricalBunkerPrice = historicalBunkerPrice;
        }

        public decimal CurrentBunkerPrice { get; }

        public decimal CurrentFxRate { get; }

        /// <summary>
        /// Indice expresado como factor decimal: 0.08 equivale a 8% de inflacion.
        /// </summary>
        public decimal InflationIndex { get; }

        /// <summary>
        /// Precio de bunker de referencia para la matriz historica cuando el Excel no lo trae por fila.
        /// </summary>
        public decimal HistoricalBunkerPrice { get; }
    }
}
