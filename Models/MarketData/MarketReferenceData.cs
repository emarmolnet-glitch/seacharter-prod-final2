using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeaCharter.Models.MarketData
{
    /// <summary>
    /// Ultimos indices de mercado utilizados por SeaCharter Core PRO para refrescar cotizaciones.
    /// </summary>
    public class MarketReferenceData
    {
        [Key]
        public int Id { get; set; }

        [Column(TypeName = "decimal(18,4)")]
        public decimal BunkerPrice { get; set; }

        [Column(TypeName = "decimal(18,6)")]
        public decimal EurUsdRate { get; set; }

        [Column(TypeName = "decimal(18,6)")]
        public decimal InflationIndex { get; set; }

        public DateTime UpdatedAtUtc { get; set; }
    }
}
