using System;

namespace SeaCharter.DTOs.Extrapolation
{
    /// <summary>
    /// Fila normalizada desde los Excels historicos 2022/2023 antes de alimentar el motor.
    /// </summary>
    public class HistoricalFreightRate
    {
        public string ReferenceCode { get; set; } = string.Empty;

        public string PortOfLoading { get; set; } = string.Empty;

        public string PortOfDischarge { get; set; } = string.Empty;

        public string? EquipmentType { get; set; }

        public DateTime HistoricalValidityDate { get; set; }

        public decimal HistoricalBaseRate { get; set; }

        public decimal HistoricalBaf { get; set; }

        public decimal HistoricalFxRate { get; set; }

        public decimal HistoricalLocalCharges { get; set; }

        /// <summary>
        /// Si el Excel incluye el bunker historico de esa fila, este valor tiene prioridad sobre el bunker historico global.
        /// </summary>
        public decimal? HistoricalBunkerPrice { get; set; }
    }
}
