using System;

namespace SeaCharter.DTOs.Extrapolation
{
    /// <summary>
    /// Resultado ajustado a valor actual para una fila historica de flete.
    /// </summary>
    public class ExtrapolatedFreightRate
    {
        public string ReferenceCode { get; set; } = string.Empty;

        public string PortOfLoading { get; set; } = string.Empty;

        public string PortOfDischarge { get; set; } = string.Empty;

        public string? EquipmentType { get; set; }

        public DateTime HistoricalValidityDate { get; set; }

        public decimal AdjustedBaseRate { get; set; }

        public decimal AdjustedBaf { get; set; }

        public decimal AdjustedLocalCharges { get; set; }

        public decimal TotalAdjustedRate { get; set; }

        public decimal FxAdjustmentFactor { get; set; }

        public decimal BunkerAdjustmentFactor { get; set; }

        public decimal LocalInflationFactor { get; set; }

        public bool IsHighRiskEstimate { get; set; }
    }
}
